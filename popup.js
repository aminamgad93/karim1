class InvoiceScraperPopup {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadOptions();
        this.updateUI();
    }

    bindEvents() {
        document.getElementById('downloadPDF').addEventListener('click', () => this.downloadData('pdf'));
        document.getElementById('downloadExcel').addEventListener('click', () => this.downloadData('excel'));
        document.getElementById('downloadJSON').addEventListener('click', () => this.downloadData('json'));
        
        // Save options on change
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.saveOptions());
        });
    }

    async downloadData(format) {
        try {
            this.showProgress();
            this.setStatus('جاري استخراج البيانات...');
            
            const options = this.getSelectedOptions();
            
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we're on the correct page
            if (!tab.url.includes('invoicing.eta.gov.eg')) {
                throw new Error('يجب أن تكون على صفحة الفواتير الإلكترونية');
            }
            
            // Execute content script to scrape data
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: this.scrapeInvoiceData,
                args: [options]
            });
            
            const invoiceData = results[0].result;
            
            if (!invoiceData || invoiceData.length === 0) {
                throw new Error('لم يتم العثور على بيانات فواتير. تأكد من وجود فواتير في الصفحة.');
            }

            this.updateProgress(50);
            this.setStatus(`تم العثور على ${invoiceData.length} فاتورة`);
            
            // Generate file based on format
            await this.generateFile(invoiceData, format, options);
            
            this.updateProgress(100);
            this.setStatus('تم التحميل بنجاح!');
            
            setTimeout(() => this.hideProgress(), 2000);
            
        } catch (error) {
            console.error('Error downloading data:', error);
            this.setStatus(`خطأ: ${error.message}`, 'error');
            this.hideProgress();
        }
    }

    scrapeInvoiceData(options) {
        const invoices = [];
        
        // Look for the correct invoice rows in the Egyptian e-invoicing system
        let rows = document.querySelectorAll('[data-automationid="DetailsRow"]');
        
        console.log(`Found ${rows.length} rows`);
        
        rows.forEach((row, index) => {
            try {
                const invoice = {};
                
                // Extract UUID and Internal Number from the first column
                const uuidCell = row.querySelector('[data-automation-key="uuid"]');
                if (uuidCell) {
                    const link = uuidCell.querySelector('a.griCellTitle');
                    if (link) {
                        invoice.uuid = link.textContent.trim();
                        invoice.link = link.href;
                    }
                    const internalNumber = uuidCell.querySelector('.griCellSubTitle');
                    if (internalNumber) {
                        invoice.internalNumber = internalNumber.textContent.trim();
                    }
                }
                
                // Extract date and time
                const dateCell = row.querySelector('[data-automation-key="dateTimeReceived"]');
                if (dateCell) {
                    const dateText = dateCell.querySelector('.griCellTitleGray')?.textContent?.trim();
                    const timeText = dateCell.querySelector('.griCellSubTitle')?.textContent.trim();
                    invoice.date = dateText;
                    invoice.time = timeText;
                }
                
                // Extract document type
                const typeCell = row.querySelector('[data-automation-key="typeName"]');
                if (typeCell) {
                    const typeText = typeCell.querySelector('.griCellTitleGray')?.textContent?.trim();
                    const versionText = typeCell.querySelector('.griCellSubTitle')?.textContent.trim();
                    invoice.documentType = typeText;
                    invoice.version = versionText;
                }
                
                // Extract total value
                const totalCell = row.querySelector('[data-automation-key="total"]');
                if (totalCell) {
                    const totalText = totalCell.querySelector('.griCellTitleGray')?.textContent?.trim();
                    invoice.totalValue = totalText;
                }
                
                // Extract issuer (seller) info
                const issuerCell = row.querySelector('[data-automation-key="issuerName"]');
                if (issuerCell) {
                    const issuerName = issuerCell.querySelector('.griCellTitleGray')?.textContent.trim();
                    const issuerTaxNumber = issuerCell.querySelector('.griCellSubTitle')?.textContent?.trim();
                    invoice.sellerName = issuerName;
                    invoice.sellerTaxNumber = issuerTaxNumber;
                }
                
                // Extract receiver (buyer) info
                const receiverCell = row.querySelector('[data-automation-key="receiverName"]');
                if (receiverCell) {
                    const receiverName = receiverCell.querySelector('.griCellTitleGray')?.textContent.trim();
                    const receiverTaxNumber = receiverCell.querySelector('.griCellSubTitle')?.textContent?.trim();
                    invoice.buyerName = receiverName;
                    invoice.buyerTaxNumber = receiverTaxNumber;
                }
                
                // Extract submission info
                const submissionCell = row.querySelector('[data-automation-key="submission"]');
                if (submissionCell) {
                    const submissionLink = submissionCell.querySelector('a.griCellTitle');
                    if (submissionLink) {
                        invoice.submissionId = submissionLink.textContent.trim();
                        invoice.submissionLink = submissionLink.href;
                    }
                }
                
                // Extract status
                const statusCell = row.querySelector('[data-automation-key="status"]');
                if (statusCell) {
                    const statusText = statusCell.querySelector('.textStatus')?.textContent?.trim();
                    invoice.status = statusText;
                }
                
                // Add row index for debugging
                invoice.rowIndex = index + 1;
                
                // Only add if we have at least UUID or internal number
                if (invoice.uuid && invoice.uuid.length > 0) {
                    invoices.push(invoice);
                }
                
            } catch (error) {
                console.error('Error extracting invoice data:', error);
            }
        });
        
        console.log(`Extracted ${invoices.length} invoices`);
        return invoices;
    }

    // Helper function to safely get text content
    getTextContent(element) {
        return element ? element.textContent?.trim() || '' : '';
    }

    async generateFile(data, format, options) {
        switch (format) {
            case 'excel':
                await this.generateExcelFile(data, options);
                break;
            case 'pdf':
                await this.generatePDFFile(data, options);
                break;
            case 'json':
                await this.generateJSONFile(data, options);
                break;
        }
    }

    async generateExcelFile(data, options) {
        try {
            // Create a simple CSV-like content for Excel
            let csvContent = '';
            
            // Define headers based on options
            const headers = [];
            if (options.includeInternalNumber) headers.push('الرقم الداخلي');
            if (options.includeDate) headers.push('تاريخ الفاتورة');
            if (options.includeDocumentType) headers.push('نوع المستند');
            if (options.includeSellerName) headers.push('اسم البائع');
            if (options.includeSellerTaxNumber) headers.push('الرقم الضريبي للبائع');
            if (options.includeBuyerName) headers.push('اسم المشتري');
            if (options.includeBuyerTaxNumber) headers.push('الرقم الضريبي للمشتري');
            headers.push('القيمة الإجمالية');
            headers.push('الحالة');
            headers.push('الرابط');
            
            // Add headers
            csvContent += headers.join('\t') + '\n';
            
            // Add data rows
            data.forEach(invoice => {
                const row = [];
                if (options.includeInternalNumber) row.push(invoice.internalNumber || '');
                if (options.includeDate) row.push(`${invoice.date || ''} ${invoice.time || ''}`.trim());
                if (options.includeDocumentType) row.push(invoice.documentType || '');
                if (options.includeSellerName) row.push(invoice.sellerName || '');
                if (options.includeSellerTaxNumber) row.push(invoice.sellerTaxNumber || '');
                if (options.includeBuyerName) row.push(invoice.buyerName || '');
                if (options.includeBuyerTaxNumber) row.push(invoice.buyerTaxNumber || '');
                row.push(invoice.totalValue || '');
                row.push(invoice.status || '');
                row.push(invoice.link || '');
                
                csvContent += row.join('\t') + '\n';
            });
            
            // Create and download file
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            this.downloadFile(blob, 'invoices.csv', 'text/csv');
            
        } catch (error) {
            console.error('Error generating Excel file:', error);
            throw error;
        }
    }

    async generatePDFFile(data, options) {
        // Create HTML content for PDF
        let htmlContent = `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    th { background-color: #2a5298; color: white; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>تقرير الفواتير الإلكترونية</h1>
                <p>تم إنشاء التقرير في: ${new Date().toLocaleDateString('ar-EG')}</p>
                <table>
                    <thead>
                        <tr>
        `;
        
        // Add headers
        if (options.includeInternalNumber) htmlContent += '<th>الرقم الداخلي</th>';
        if (options.includeDate) htmlContent += '<th>تاريخ الفاتورة</th>';
        if (options.includeDocumentType) htmlContent += '<th>نوع المستند</th>';
        if (options.includeSellerName) htmlContent += '<th>اسم البائع</th>';
        if (options.includeSellerTaxNumber) htmlContent += '<th>الرقم الضريبي للبائع</th>';
        if (options.includeBuyerName) htmlContent += '<th>اسم المشتري</th>';
        if (options.includeBuyerTaxNumber) htmlContent += '<th>الرقم الضريبي للمشتري</th>';
        htmlContent += '<th>القيمة الإجمالية</th><th>الحالة</th>';
        
        htmlContent += '</tr></thead><tbody>';
        
        // Add data rows
        data.forEach(invoice => {
            htmlContent += '<tr>';
            if (options.includeInternalNumber) htmlContent += `<td>${invoice.internalNumber || ''}</td>`;
            if (options.includeDate) htmlContent += `<td>${invoice.date || ''} ${invoice.time || ''}</td>`;
            if (options.includeDocumentType) htmlContent += `<td>${invoice.documentType || ''}</td>`;
            if (options.includeSellerName) htmlContent += `<td>${invoice.sellerName || ''}</td>`;
            if (options.includeSellerTaxNumber) htmlContent += `<td>${invoice.sellerTaxNumber || ''}</td>`;
            if (options.includeBuyerName) htmlContent += `<td>${invoice.buyerName || ''}</td>`;
            if (options.includeBuyerTaxNumber) htmlContent += `<td>${invoice.buyerTaxNumber || ''}</td>`;
            htmlContent += `<td>${invoice.totalValue || ''}</td>`;
            htmlContent += `<td>${invoice.status || ''}</td>`;
            htmlContent += '</tr>';
        });
        
        htmlContent += '</tbody></table></body></html>';
        
        // Create and download HTML file (can be opened and printed as PDF)
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        this.downloadFile(blob, 'invoices.html', 'text/html');
    }

    async generateJSONFile(data, options) {
        const filteredData = data.map(invoice => {
            const filtered = {};
            
            if (options.includeInternalNumber) filtered.internalNumber = invoice.internalNumber;
            if (options.includeDate) filtered.date = invoice.date;
            if (options.includeDocumentType) filtered.documentType = invoice.documentType;
            if (options.includeSellerName) filtered.sellerName = invoice.sellerName;
            if (options.includeSellerTaxNumber) filtered.sellerTaxNumber = invoice.sellerTaxNumber;
            if (options.includeBuyerName) filtered.buyerName = invoice.buyerName;
            if (options.includeBuyerTaxNumber) filtered.buyerTaxNumber = invoice.buyerTaxNumber;
            filtered.totalValue = invoice.totalValue;
            filtered.status = invoice.status;
            filtered.uuid = invoice.uuid;
            filtered.link = invoice.link;
            
            return filtered;
        });
        
        const jsonString = JSON.stringify(filteredData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        this.downloadFile(blob, 'invoices.json', 'application/json');
    }

    downloadFile(blob, filename, mimeType) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getSelectedOptions() {
        return {
            includeDate: document.getElementById('includeDate').checked,
            includeInternalNumber: document.getElementById('includeInternalNumber').checked,
            includeSellerTaxNumber: document.getElementById('includeSellerTaxNumber').checked,
            includeSellerName: document.getElementById('includeSellerName').checked,
            includeBuyerTaxNumber: document.getElementById('includeBuyerTaxNumber').checked,
            includeBuyerName: document.getElementById('includeBuyerName').checked,
            includeEmail: document.getElementById('includeEmail').checked,
            includeDocumentType: document.getElementById('includeDocumentType').checked,
            allPages: document.getElementById('allPages').checked,
            separateFolders: document.getElementById('separateFolders').checked,
            combineAllItems: document.getElementById('combineAllItems').checked
        };
    }

    saveOptions() {
        try {
            const options = this.getSelectedOptions();
            // Use localStorage instead of chrome.storage for simplicity
            localStorage.setItem('invoiceScraperOptions', JSON.stringify(options));
        } catch (error) {
            console.error('Error saving options:', error);
        }
    }

    async loadOptions() {
        try {
            // Use localStorage instead of chrome.storage
            const stored = localStorage.getItem('invoiceScraperOptions');
            if (stored) {
                const options = JSON.parse(stored);
                Object.keys(options).forEach(key => {
                    const element = document.getElementById(key);
                    if (element) {
                        element.checked = options[key];
                    }
                });
            }
        } catch (error) {
            console.error('Error loading options:', error);
        }
    }

    showProgress() {
        document.getElementById('progressSection').style.display = 'block';
        this.updateProgress(0);
    }

    hideProgress() {
        document.getElementById('progressSection').style.display = 'none';
    }

    updateProgress(percent) {
        document.getElementById('progressFill').style.width = `${percent}%`;
        document.getElementById('progressText').textContent = `${percent}%`;
    }

    setStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }

    updateUI() {
        // Update total count if available
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url && tabs[0].url.includes('invoicing.eta.gov.eg')) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    func: () => {
                        const totalElement = document.querySelector('.eta-pagination-totalrecordCount-label');
                        if (totalElement) {
                            const match = totalElement.textContent.match(/\d+/);
                            return match ? match[0] : '140';
                        }
                        return '140';
                    }
                }).then(results => {
                    if (results[0]?.result) {
                        document.getElementById('totalCount').textContent = results[0].result;
                    }
                }).catch(error => {
                    console.error('Error getting total count:', error);
                });
            }
        });
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new InvoiceScraperPopup();
});