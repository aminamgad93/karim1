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
        console.log('Starting invoice data scraping...');
        const invoices = [];
        
        // Look for invoice rows using the exact structure from the HTML
        let rows = document.querySelectorAll('div[data-automationid="DetailsRow"]');
        console.log(`Found ${rows.length} detail rows`);
        
        if (rows.length === 0) {
            // Fallback: try to find rows by class
            rows = document.querySelectorAll('.ms-DetailsRow');
            console.log(`Fallback: Found ${rows.length} ms-DetailsRow elements`);
        }
        
        if (rows.length === 0) {
            // Another fallback: look for any row with invoice data
            rows = document.querySelectorAll('[role="row"]');
            console.log(`Second fallback: Found ${rows.length} role=row elements`);
        }
        
        rows.forEach((row, index) => {
            try {
                console.log(`Processing row ${index + 1}`);
                const invoice = {};
                
                // Extract UUID and Internal Number from the first column
                const uuidCell = row.querySelector('[data-automation-key="uuid"]');
                if (uuidCell) {
                    // Look for the UUID link
                    const uuidLink = uuidCell.querySelector('a.griCellTitle');
                    if (uuidLink) {
                        invoice.uuid = uuidLink.textContent.trim();
                        invoice.link = uuidLink.href;
                        console.log(`Found UUID: ${invoice.uuid}`);
                    }
                    
                    // Look for internal number
                    const internalNumberElement = uuidCell.querySelector('.griCellSubTitle');
                    if (internalNumberElement) {
                        invoice.internalNumber = internalNumberElement.textContent.trim();
                        console.log(`Found internal number: ${invoice.internalNumber}`);
                    }
                }
                
                // Extract date and time from the second column
                const dateCell = row.querySelector('[data-automation-key="dateTimeReceived"]');
                if (dateCell) {
                    const dateElement = dateCell.querySelector('.griCellTitleGray');
                    const timeElement = dateCell.querySelector('.griCellSubTitle');
                    
                    if (dateElement) {
                        invoice.date = dateElement.textContent.trim();
                    }
                    if (timeElement) {
                        invoice.time = timeElement.textContent.trim();
                    }
                    invoice.fullDateTime = `${invoice.date || ''} ${invoice.time || ''}`.trim();
                    console.log(`Found date/time: ${invoice.fullDateTime}`);
                }
                
                // Extract document type from the third column
                const typeCell = row.querySelector('[data-automation-key="typeName"]');
                if (typeCell) {
                    const typeElement = typeCell.querySelector('.griCellTitleGray');
                    const versionElement = typeCell.querySelector('.griCellSubTitle');
                    
                    if (typeElement) {
                        invoice.documentType = typeElement.textContent.trim();
                    }
                    if (versionElement) {
                        invoice.version = versionElement.textContent.trim();
                    }
                    console.log(`Found document type: ${invoice.documentType} v${invoice.version}`);
                }
                
                // Extract total value from the fourth column
                const totalCell = row.querySelector('[data-automation-key="total"]');
                if (totalCell) {
                    const totalElement = totalCell.querySelector('.griCellTitleGray');
                    if (totalElement) {
                        invoice.totalValue = totalElement.textContent.trim();
                        console.log(`Found total: ${invoice.totalValue}`);
                    }
                }
                
                // Extract seller info from the fifth column
                const issuerCell = row.querySelector('[data-automation-key="issuerName"]');
                if (issuerCell) {
                    const nameElement = issuerCell.querySelector('.griCellTitleGray');
                    const taxElement = issuerCell.querySelector('.griCellSubTitle');
                    
                    if (nameElement) {
                        invoice.sellerName = nameElement.textContent.trim();
                    }
                    if (taxElement) {
                        invoice.sellerTaxNumber = taxElement.textContent.trim();
                    }
                    console.log(`Found seller: ${invoice.sellerName} (${invoice.sellerTaxNumber})`);
                }
                
                // Extract buyer info from the sixth column
                const receiverCell = row.querySelector('[data-automation-key="receiverName"]');
                if (receiverCell) {
                    const nameElement = receiverCell.querySelector('.griCellTitleGray');
                    const taxElement = receiverCell.querySelector('.griCellSubTitle');
                    
                    if (nameElement) {
                        invoice.buyerName = nameElement.textContent.trim();
                    }
                    if (taxElement) {
                        invoice.buyerTaxNumber = taxElement.textContent.trim();
                    }
                    console.log(`Found buyer: ${invoice.buyerName} (${invoice.buyerTaxNumber})`);
                }
                
                // Extract submission info from the seventh column
                const submissionCell = row.querySelector('[data-automation-key="submission"]');
                if (submissionCell) {
                    const submissionLink = submissionCell.querySelector('a.griCellTitle');
                    if (submissionLink) {
                        invoice.submissionId = submissionLink.textContent.trim();
                        invoice.submissionLink = submissionLink.href;
                        console.log(`Found submission: ${invoice.submissionId}`);
                    }
                }
                
                // Extract status from the eighth column
                const statusCell = row.querySelector('[data-automation-key="status"]');
                if (statusCell) {
                    const statusElement = statusCell.querySelector('.textStatus');
                    if (statusElement) {
                        invoice.status = statusElement.textContent.trim();
                        console.log(`Found status: ${invoice.status}`);
                    }
                }
                
                // Only add if we have meaningful data
                if (invoice.uuid || invoice.internalNumber || invoice.totalValue) {
                    invoices.push(invoice);
                    console.log(`Added invoice ${invoices.length}: ${invoice.uuid || invoice.internalNumber}`);
                } else {
                    console.log(`Skipping row ${index + 1} - no meaningful data found`);
                }
                
            } catch (error) {
                console.error(`Error processing row ${index + 1}:`, error);
            }
        });
        
        console.log(`Total invoices extracted: ${invoices.length}`);
        return invoices;
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
            headers.push('الرقم الإلكتروني');
            if (options.includeDate) headers.push('تاريخ ووقت الإنشاء');
            if (options.includeDocumentType) headers.push('نوع المستند');
            if (options.includeDocumentType) headers.push('الإصدار');
            if (options.includeSellerName) headers.push('اسم البائع');
            if (options.includeSellerTaxNumber) headers.push('الرقم الضريبي للبائع');
            if (options.includeBuyerName) headers.push('اسم المشتري');
            if (options.includeBuyerTaxNumber) headers.push('الرقم الضريبي للمشتري');
            if (options.includeEmail) headers.push('البريد الإلكتروني');
            headers.push('القيمة الإجمالية');
            headers.push('الحالة');
            headers.push('الرابط');
            
            // Add headers
            csvContent += headers.join('\t') + '\n';
            
            // Add data rows
            data.forEach(invoice => {
                const row = [];
                if (options.includeInternalNumber) row.push(invoice.internalNumber || '');
                row.push(invoice.uuid || '');
                if (options.includeDate) row.push(invoice.fullDateTime || '');
                if (options.includeDocumentType) row.push(invoice.documentType || '');
                if (options.includeDocumentType) row.push(invoice.version || '');
                if (options.includeSellerName) row.push(invoice.sellerName || '');
                if (options.includeSellerTaxNumber) row.push(invoice.sellerTaxNumber || '');
                if (options.includeBuyerName) row.push(invoice.buyerName || '');
                if (options.includeBuyerTaxNumber) row.push(invoice.buyerTaxNumber || '');
                if (options.includeEmail) row.push(invoice.email || '');
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
        htmlContent += '<th>الرقم الإلكتروني</th>';
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
            htmlContent += `<td>${invoice.uuid || ''}</td>`;
            if (options.includeDate) htmlContent += `<td>${invoice.fullDateTime || ''}</td>`;
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
            filtered.uuid = invoice.uuid;
            if (options.includeDate) filtered.date = invoice.fullDateTime;
            if (options.includeDocumentType) filtered.documentType = invoice.documentType;
            if (options.includeSellerName) filtered.sellerName = invoice.sellerName;
            if (options.includeSellerTaxNumber) filtered.sellerTaxNumber = invoice.sellerTaxNumber;
            if (options.includeBuyerName) filtered.buyerName = invoice.buyerName;
            if (options.includeBuyerTaxNumber) filtered.buyerTaxNumber = invoice.buyerTaxNumber;
            filtered.totalValue = invoice.totalValue;
            filtered.status = invoice.status;
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
            localStorage.setItem('invoiceScraperOptions', JSON.stringify(options));
        } catch (error) {
            console.error('Error saving options:', error);
        }
    }

    async loadOptions() {
        try {
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
                            return match ? match[0] : '141';
                        }
                        return '141';
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