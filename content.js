class InvoiceScraperContent {
    constructor() {
        this.init();
    }

    init() {
        this.injectStyles();
        this.enhanceViewButtons();
        this.setupObserver();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .invoice-scraper-highlight {
                background-color: rgba(42, 82, 152, 0.1) !important;
                border: 1px solid #2a5298 !important;
            }
            
            .invoice-scraper-processing {
                opacity: 0.6;
                pointer-events: none;
            }
            
            .invoice-scraper-success {
                background-color: rgba(16, 185, 129, 0.1) !important;
                border: 1px solid #10b981 !important;
            }
            
            .invoice-scraper-error {
                background-color: rgba(239, 68, 68, 0.1) !important;
                border: 1px solid #ef4444 !important;
            }
        `;
        document.head.appendChild(style);
    }

    enhanceViewButtons() {
        const viewButtons = document.querySelectorAll('.eta-view-btn');
        viewButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.showInvoiceDetails(button);
            });
        });
    }

    async showInvoiceDetails(button) {
        const row = button.closest('.ms-DetailsRow');
        if (!row) return;

        const invoice = this.extractInvoiceFromRow(row);
        
        // Create modal
        const modal = this.createDetailsModal(invoice);
        document.body.appendChild(modal);
        
        // Show modal
        modal.style.display = 'flex';
        
        // Handle modal close
        modal.querySelector('.eta-details-close').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    extractInvoiceFromRow(row) {
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
        
        return invoice;
    }

    createDetailsModal(invoice) {
        const modal = document.createElement('div');
        modal.className = 'eta-details-modal';
        modal.innerHTML = `
            <div class="eta-details-content">
                <div class="eta-details-header">
                    <h2 class="eta-details-title">تفاصيل الفاتورة</h2>
                    <button class="eta-details-close">×</button>
                </div>
                <div class="eta-details-body">
                    <div class="eta-details-grid">
                        <div class="eta-details-section eta-details-highlight">
                            <h3 class="eta-details-section-title">معلومات أساسية</h3>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الرقم الإلكتروني:</span>
                                <span class="eta-details-value">${invoice.uuid || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الرقم الداخلي:</span>
                                <span class="eta-details-value">${invoice.internalNumber || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">التاريخ:</span>
                                <span class="eta-details-value">${invoice.date || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الوقت:</span>
                                <span class="eta-details-value">${invoice.time || 'غير متوفر'}</span>
                            </div>
                        </div>
                        
                        <div class="eta-details-section">
                            <h3 class="eta-details-section-title">معلومات المستند</h3>
                            <div class="eta-details-field">
                                <span class="eta-details-label">نوع المستند:</span>
                                <span class="eta-details-value">${invoice.documentType || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الإصدار:</span>
                                <span class="eta-details-value">${invoice.version || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">القيمة الإجمالية:</span>
                                <span class="eta-details-value">${invoice.totalValue || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الحالة:</span>
                                <span class="eta-details-value">${invoice.status || 'غير متوفر'}</span>
                            </div>
                        </div>
                        
                        <div class="eta-details-section">
                            <h3 class="eta-details-section-title">معلومات البائع</h3>
                            <div class="eta-details-field">
                                <span class="eta-details-label">اسم البائع:</span>
                                <span class="eta-details-value">${invoice.sellerName || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الرقم الضريبي:</span>
                                <span class="eta-details-value">${invoice.sellerTaxNumber || 'غير متوفر'}</span>
                            </div>
                        </div>
                        
                        <div class="eta-details-section">
                            <h3 class="eta-details-section-title">معلومات المشتري</h3>
                            <div class="eta-details-field">
                                <span class="eta-details-label">اسم المشتري:</span>
                                <span class="eta-details-value">${invoice.buyerName || 'غير متوفر'}</span>
                            </div>
                            <div class="eta-details-field">
                                <span class="eta-details-label">الرقم الضريبي:</span>
                                <span class="eta-details-value">${invoice.buyerTaxNumber || 'غير متوفر'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return modal;
    }

    setupObserver() {
        // Watch for pagination changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Re-enhance view buttons when new content is loaded
                    this.enhanceViewButtons();
                }
            });
        });

        const targetNode = document.querySelector('.ms-DetailsList');
        if (targetNode) {
            observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
        }
    }

    // Method to handle pagination for scraping all pages
    async scrapeAllPages() {
        const allInvoices = [];
        const currentPageInvoices = this.scrapeCurrentPage();
        allInvoices.push(...currentPageInvoices);
        
        // Check if there are more pages
        const nextButton = document.querySelector('.eta-pagination button[data-icon-name="ChevronRight"]:not(.is-disabled)');
        
        if (nextButton) {
            nextButton.click();
            
            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Recursively scrape next page
            const nextPageInvoices = await this.scrapeAllPages();
            allInvoices.push(...nextPageInvoices);
        }
        
        return allInvoices;
    }

    scrapeCurrentPage() {
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
        
        console.log(`Content script found ${rows.length} rows`);
        
        rows.forEach((row) => {
            const invoice = this.extractInvoiceFromRow(row);
            if ((invoice.uuid && invoice.uuid.length > 0) || 
                (invoice.internalNumber && invoice.internalNumber.length > 0) ||
                (invoice.totalValue && invoice.totalValue.length > 0)) {
                invoices.push(invoice);
            }
        });
        
        // Fallback approach if no invoices found
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
        
        console.log(`Content script extracted ${invoices.length} invoices`);
        return invoices;
    }
}

// Initialize content script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new InvoiceScraperContent();
    });
} else {
    new InvoiceScraperContent();
}