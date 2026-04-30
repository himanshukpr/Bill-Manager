import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type DeliveryAnalysisRow = {
  dateLabel: string
  supplierName: string
  itemsLabel: string
  quantity: number
}

export function downloadDeliveryAnalysisPdf(rows: DeliveryAnalysisRow[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Delivery Analysis', 14, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Delivery entries by date, supplier, items, and quantity', 14, 23)

  autoTable(doc, {
    startY: 30,
    head: [[
      'Date',
      'Supplier',
      'Items',
      'Quantity',
    ]],
    body: rows.map((row) => [
      row.dateLabel,
      row.supplierName,
      row.itemsLabel,
      String(row.quantity),
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  })

  doc.save('delivery-analysis.pdf')
}

