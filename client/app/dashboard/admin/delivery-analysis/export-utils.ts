import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type DeliveryAnalysisRow = {
  supplierName: string
  plannedQuantity: number
  deliveredQuantity: number
  delta: number
}

export function downloadDeliveryAnalysisPdf(rows: DeliveryAnalysisRow[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Delivery Analysis', 14, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Plans vs delivery logs by supplier', 14, 23)

  autoTable(doc, {
    startY: 30,
    head: [[
      'Supplier',
      'Planned Qty',
      'Delivered Qty',
      'Delta',
    ]],
    body: rows.map((row) => [
      row.supplierName,
      String(row.plannedQuantity),
      String(row.deliveredQuantity),
      String(row.delta),
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

