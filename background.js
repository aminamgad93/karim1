class InvoiceScraperBackground {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener(() => {
            console.log('Invoice Scraper Extension installed');
        });

        // Handle messages from content script or popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Handle tab updates to check if we're on the correct page
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url && tab.url.includes('invoicing.eta.gov.eg')) {
                this.injectContentScript(tabId);
            }
        });
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'scrapeData':
                    const data = await this.scrapeInvoiceData(sender.tab.id, request.options);
                    sendResponse({ success: true, data });
                    break;
                    
                case 'downloadFile':
                    await this.downloadFile(request.data, request.filename, request.mimeType);
                    sendResponse({ success: true });
                    break;
                    
                case 'checkPageStatus':
                    const isValidPage = await this.checkIfValidPage(sender.tab.id);
                    sendResponse({ success: true, isValidPage });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async scrapeInvoiceData(tabId, options) {
        try {
            // First, check if we need to scrape all pages
            if (options.allPages) {
                return await this.scrapeAllPages(tabId, options);
            } else {
                return await this.scrapeCurrentPage(tabId, options);
            }
        } catch (error) {
            console.error('Error scraping invoice data:', error);
            throw error;
        }
    }

    async scrapeAllPages(tabId, options) {
        const allInvoices = [];
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
            try {
                // Scrape current page
                const pageInvoices = await this.scrapeCurrentPage(tabId, options);
                allInvoices.push(...pageInvoices);
                
                // Check if there's a next page
                const nextPageAvailable = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        const nextButton = document.querySelector('.eta-pagination button[data-icon-name="ChevronRight"]:not(.is-disabled)');
                        return nextButton !== null;
                    }
                });
                
                if (nextPageAvailable[0]?.result) {
                    // Click next page
                    await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                            const nextButton = document.querySelector('.eta-pagination button[data-icon-name="ChevronRight"]:not(.is-disabled)');
                            if (nextButton) {
                                nextButton.click();
                            }
                        }
                    });
                    
                    // Wait for page to load
                    await this.sleep(3000);
                    
                    currentPage++;
                    
                    // Safety check to avoid infinite loop
                    if (currentPage > 50) {
                        console.warn('Maximum page limit reached');
                        hasMorePages = false;
                    }
                } else {
                    hasMorePages = false;
                }
                
            } catch (error) {
                console.error('Error scraping page:', error);
                hasMorePages = false;
            }
        }
        
        return allInvoices;
    }

    async scrapeCurrentPage(tabId, options) {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: this.extractInvoiceData,
            args: [options]
        });
        
        return results[0]?.result || [];
    }

    extractInvoiceData(options) {
        const invoices = [];
        
        // Try multiple selectors to find invoice rows
        let rows = document.querySelectorAll('div[data-automationid="DetailsRow"]');
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('.ms-DetailsRow');
        }
        
        if (rows.length === 0) {
            const listContainer = document.querySelector('.ms-DetailsList');
            if (listContainer) {
                rows = listContainer.querySelectorAll('[role="row"]');
            }
        }
        
        console.log(`Background script found ${rows.length} invoice rows`);
        
        rows.forEach((row) => {
            try {
                const invoice = {};
                
                // Extract UUID and Internal Number - try multiple selectors
                let uuidCell = row.querySelector('[data-automation-key="uuid"]');
                if (!uuidCell) {
                    uuidCell = row.querySelector('.recentDoc-internlId');
                }
                if (!uuidCell) {
                    uuidCell = row.querySelector('.items-uuid_internal');
                }
                
                if (uuidCell) {
                    const link = uuidCell.querySelector('a.griCellTitle') || uuidCell.querySelector('a');
                    if (link) {
                        invoice.uuid = link.textContent.trim();
                        invoice.link = link.href;
                    }
                    const internalNumber = uuidCell.querySelector('.griCellSubTitle');
                    if (internalNumber) {
                        invoice.internalNumber = internalNumber.textContent.trim();
                    }
                }
                
                // Extract date and time - try multiple selectors
                let dateCell = row.querySelector('[data-automation-key="dateTimeReceived"]');
                if (dateCell) {
                    const dateText = dateCell.querySelector('.griCellTitleGray')?.textContent?.trim() || '';
                    const timeText = dateCell.querySelector('.griCellSubTitle')?.textContent?.trim() || '';
                    invoice.date = dateText;
                    invoice.time = timeText;
                    invoice.fullDateTime = `${dateText} ${timeText}`.trim();
                }
                
                // Extract document type - try multiple selectors
                let typeCell = row.querySelector('[data-automation-key="typeName"]');
                if (!typeCell) {
                    typeCell = row.querySelector('.recentDoc-type');
                }
                
                if (typeCell) {
                    const typeText = typeCell.querySelector('.griCellTitleGray')?.textContent?.trim() || '';
                    const versionText = typeCell.querySelector('.griCellSubTitle')?.textContent?.trim() || '';
                    invoice.documentType = typeText;
                    invoice.version = versionText;
                }
                
                // Extract total value - try multiple selectors
                let totalCell = row.querySelector('[data-automation-key="total"]');
                if (totalCell) {
                    const totalText = totalCell.querySelector('.griCellTitleGray')?.textContent?.trim() || totalCell.textContent?.trim();
                    invoice.totalValue = totalText;
                }
                
                // Extract issuer (seller) info - try multiple selectors
                let issuerCell = row.querySelector('[data-automation-key="issuerName"]');
                if (issuerCell) {
                    const issuerName = issuerCell.querySelector('.griCellTitleGray')?.textContent?.trim() || '';
                    const issuerTaxNumber = issuerCell.querySelector('.griCellSubTitle')?.textContent?.trim() || '';
                    invoice.sellerName = issuerName;
                    invoice.sellerTaxNumber = issuerTaxNumber;
                }
                
                // Extract receiver (buyer) info - try multiple selectors
                let receiverCell = row.querySelector('[data-automation-key="receiverName"]');
                if (receiverCell) {
                    const receiverName = receiverCell.querySelector('.griCellTitleGray')?.textContent?.trim() || '';
                    const receiverTaxNumber = receiverCell.querySelector('.griCellSubTitle')?.textContent?.trim() || '';
                    invoice.buyerName = receiverName;
                    invoice.buyerTaxNumber = receiverTaxNumber;
                }
                
                // Extract submission info - try multiple selectors
                let submissionCell = row.querySelector('[data-automation-key="submission"]');
                if (submissionCell) {
                    const submissionLink = submissionCell.querySelector('a.griCellTitle') || submissionCell.querySelector('a');
                    if (submissionLink) {
                        invoice.submissionId = submissionLink.textContent.trim();
                        invoice.submissionLink = submissionLink.href;
                    }
                }
                
                // Extract status - try multiple selectors
                let statusCell = row.querySelector('[data-automation-key="status"]');
                if (!statusCell) {
                    statusCell = row.querySelector('.doc-status');
                }
                
                if (statusCell) {
                    const statusText = statusCell.querySelector('.textStatus')?.textContent?.trim() || statusCell.textContent?.trim();
                    invoice.status = statusText;
                }
                
                // Only add if we have meaningful data
                if ((invoice.uuid && invoice.uuid.length > 0) || 
                    (invoice.internalNumber && invoice.internalNumber.length > 0) ||
                    (invoice.totalValue && invoice.totalValue.length > 0)) {
                    invoices.push(invoice);
                }
                
            } catch (error) {
                console.error('Error extracting invoice data from row:', error);
            }
        });
        
        // Fallback: try to find any document links if no structured data found
        if (invoices.length === 0) {
            const allLinks = document.querySelectorAll('a[href*="/documents/"]');
            allLinks.forEach((link) => {
                if (link.href.includes('/documents/') && !link.href.includes('/submissions/')) {
                    const uuid = link.textContent.trim();
                    if (uuid.length > 10) {
                        invoices.push({
                            uuid: uuid,
                            link: link.href
                        });
                    }
                }
            });
        }
        
        console.log(`Background script extracted ${invoices.length} invoices`);
        return invoices;
    }

    async downloadFile(data, filename, mimeType) {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        return new Promise((resolve, reject) => {
            chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(downloadId);
                }
            });
        });
    }

    async checkIfValidPage(tabId) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    return document.querySelector('.ms-DetailsList') !== null &&
                           document.querySelector('[data-automation-key="uuid"]') !== null;
                }
            });
            
            return results[0]?.result || false;
        } catch (error) {
            console.error('Error checking page validity:', error);
            return false;
        }
    }

    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
        } catch (error) {
            console.error('Error injecting content script:', error);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize background script
new InvoiceScraperBackground();