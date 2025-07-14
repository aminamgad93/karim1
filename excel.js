class ExcelGenerator {
    constructor() {
        this.workbook = null;
        this.formatter = new InvoiceFormatter();
    }

    async generateExcel(invoices, options) {
        try {
            // Initialize workbook
            const ExcelJS = await this.loadExcelJS();
            this.workbook = new ExcelJS.Workbook();
            
            // Set workbook properties
            this.workbook.creator = 'Invoice Scraper Extension';
            this.workbook.created = new Date();
            this.workbook.modified = new Date();
            this.workbook.lastModifiedBy = 'Invoice Scraper Extension';
            
            // Format data
            const formattedInvoices = this.formatter.formatInvoiceData(invoices, options);
            
            // Organize by folders if needed
            const organized = this.formatter.organizeByFolders(formattedInvoices, options);
            
            // Create worksheets
            Object.keys(organized).forEach(folderName => {
                this.createWorksheet(folderName, organized[folderName], options);
            });
            
            // Generate buffer
            const buffer = await this.workbook.xlsx.writeBuffer();
            return buffer;
            
        } catch (error) {
            console.error('Error generating Excel file:', error);
            throw error;
        }
    }

    createWorksheet(name, invoices, options) {
        const worksheet = this.workbook.addWorksheet(name);
        
        // Generate headers
        const headers = this.formatter.generateExcelHeaders(options);
        
        // Add headers
        const headerRow = worksheet.addRow(headers);
        
        // Style headers
        this.styleHeaderRow(headerRow);
        
        // Add data rows
        invoices.forEach(invoice => {
            const row = this.formatter.generateExcelRow(invoice, options);
            const dataRow = worksheet.addRow(row);
            this.styleDataRow(dataRow);
        });
        
        // Auto-size columns
        this.autoSizeColumns(worksheet);
        
        // Add filters
        worksheet.autoFilter = {
            from: 'A1',
            to: `${String.fromCharCode(65 + headers.length - 1)}1`
        };
        
        // Freeze header row
        worksheet.views = [
            { state: 'frozen', ySplit: 1 }
        ];
        
        // Set RTL direction
        worksheet.views[0].rightToLeft = true;
    }

    styleHeaderRow(headerRow) {
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2a5298' }
            };
            cell.font = {
                bold: true,
                color: { argb: 'FFFFFFFF' },
                size: 12,
                name: 'Arial'
            };
            cell.alignment = {
                horizontal: 'center',
                vertical: 'middle'
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };
        });
        
        headerRow.height = 25;
    }

    styleDataRow(dataRow) {
        dataRow.eachCell((cell, colNumber) => {
            cell.font = {
                name: 'Arial',
                size: 11
            };
            cell.alignment = {
                horizontal: 'right',
                vertical: 'middle',
                wrapText: true
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
            };
            
            // Alternate row colors
            if (dataRow.number % 2 === 0) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8F9FA' }
                };
            }
        });
        
        dataRow.height = 20;
    }

    autoSizeColumns(worksheet) {
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            const columnLetter = column.letter;
            
            worksheet.eachRow({ includeEmpty: true }, (row) => {
                const cell = row.getCell(columnLetter);
                if (cell.value) {
                    const cellLength = cell.value.toString().length;
                    if (cellLength > maxLength) {
                        maxLength = cellLength;
                    }
                }
            });
            
            // Set column width with min/max constraints
            column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        });
    }

    async loadExcelJS() {
        // Check if ExcelJS is already loaded
        if (typeof ExcelJS !== 'undefined') {
            return ExcelJS;
        }
        
        // Load ExcelJS dynamically
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            script.onload = () => {
                resolve(window.ExcelJS);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async downloadExcel(buffer, filename = 'invoices.xlsx') {
        const blob = new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const url = URL.createObjectURL(blob);
        
        // Use Chrome downloads API if available
        if (chrome && chrome.downloads) {
            chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            });
        } else {
            // Fallback to regular download
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExcelGenerator;
} else {
    window.ExcelGenerator = ExcelGenerator;
}