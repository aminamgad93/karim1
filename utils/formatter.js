class InvoiceFormatter {
    constructor() {
        this.dateFormatter = new Intl.DateTimeFormat('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatInvoiceData(invoices, options) {
        return invoices.map(invoice => {
            const formatted = {};
            
            // Always include basic info
            formatted.uuid = invoice.uuid;
            formatted.totalValue = this.formatCurrency(invoice.totalValue);
            formatted.status = invoice.status;
            
            // Conditionally include fields based on options
            if (options.includeDate) {
                formatted.date = this.formatDate(invoice.date, invoice.time);
            }
            
            if (options.includeInternalNumber) {
                formatted.internalNumber = invoice.internalNumber;
            }
            
            if (options.includeSellerTaxNumber) {
                formatted.sellerTaxNumber = invoice.sellerTaxNumber;
            }
            
            if (options.includeSellerName) {
                formatted.sellerName = this.formatName(invoice.sellerName);
            }
            
            if (options.includeBuyerTaxNumber) {
                formatted.buyerTaxNumber = invoice.buyerTaxNumber;
            }
            
            if (options.includeBuyerName) {
                formatted.buyerName = this.formatName(invoice.buyerName);
            }
            
            if (options.includeEmail) {
                formatted.email = invoice.email || '';
            }
            
            if (options.includeDocumentType) {
                formatted.documentType = invoice.documentType;
                formatted.version = invoice.version;
            }
            
            return formatted;
        });
    }

    formatDate(date, time) {
        if (!date) return '';
        
        try {
            // Parse the date string (assuming format DD/MM/YYYY)
            const [day, month, year] = date.split('/');
            const dateObj = new Date(year, month - 1, day);
            
            if (time) {
                const [hours, minutes] = time.replace(/[^\d:]/g, '').split(':');
                dateObj.setHours(parseInt(hours) || 0, parseInt(minutes) || 0);
            }
            
            return this.dateFormatter.format(dateObj);
        } catch (error) {
            console.error('Error formatting date:', error);
            return `${date} ${time}`.trim();
        }
    }

    formatCurrency(value) {
        if (!value) return '';
        
        try {
            // Remove any non-numeric characters except decimal point
            const numericValue = value.replace(/[^\d.-]/g, '');
            const number = parseFloat(numericValue);
            
            if (isNaN(number)) return value;
            
            return new Intl.NumberFormat('ar-EG', {
                style: 'currency',
                currency: 'EGP',
                minimumFractionDigits: 2
            }).format(number);
        } catch (error) {
            console.error('Error formatting currency:', error);
            return value;
        }
    }

    formatName(name) {
        if (!name) return '';
        
        // Clean up name by removing extra spaces and fixing encoding issues
        return name.trim().replace(/\s+/g, ' ');
    }

    generateExcelHeaders(options) {
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
        
        return headers;
    }

    generateExcelRow(invoice, options) {
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
        
        return row;
    }

    organizeByFolders(invoices, options) {
        if (!options.separateFolders) return { 'all': invoices };
        
        const folders = {};
        
        invoices.forEach(invoice => {
            let folderName = 'other';
            
            if (options.includeSellerName && invoice.sellerName) {
                folderName = this.sanitizeFolderName(invoice.sellerName);
            } else if (options.includeBuyerName && invoice.buyerName) {
                folderName = this.sanitizeFolderName(invoice.buyerName);
            }
            
            if (!folders[folderName]) {
                folders[folderName] = [];
            }
            
            folders[folderName].push(invoice);
        });
        
        return folders;
    }

    sanitizeFolderName(name) {
        if (!name) return 'unknown';
        
        // Remove invalid characters for folder names
        return name.replace(/[<>:"/\\|?*]/g, '_')
                  .replace(/\s+/g, '_')
                  .substring(0, 50); // Limit length
    }

    combineAllItems(invoices, options) {
        if (!options.combineAllItems) return invoices;
        
        // Group invoices by seller or buyer
        const grouped = {};
        
        invoices.forEach(invoice => {
            const key = invoice.sellerTaxNumber || invoice.buyerTaxNumber || 'unknown';
            
            if (!grouped[key]) {
                grouped[key] = {
                    ...invoice,
                    totalValue: 0,
                    count: 0,
                    items: []
                };
            }
            
            grouped[key].items.push(invoice);
            grouped[key].count++;
            
            // Sum total values
            const value = parseFloat(invoice.totalValue?.replace(/[^\d.-]/g, '') || 0);
            grouped[key].totalValue += value;
        });
        
        // Convert back to array
        return Object.values(grouped).map(group => ({
            ...group,
            totalValue: group.totalValue.toFixed(2),
            internalNumber: `${group.internalNumber} (+${group.count - 1} أخرى)`
        }));
    }

    validateInvoiceData(invoices) {
        const errors = [];
        const warnings = [];
        
        invoices.forEach((invoice, index) => {
            if (!invoice.uuid) {
                errors.push(`الفاتورة رقم ${index + 1}: مفقود الرقم الإلكتروني`);
            }
            
            if (!invoice.totalValue) {
                warnings.push(`الفاتورة رقم ${index + 1}: مفقود القيمة الإجمالية`);
            }
            
            if (!invoice.sellerName && !invoice.buyerName) {
                warnings.push(`الفاتورة رقم ${index + 1}: مفقود اسم البائع والمشتري`);
            }
        });
        
        return { errors, warnings };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InvoiceFormatter;
} else {
    window.InvoiceFormatter = InvoiceFormatter;
}