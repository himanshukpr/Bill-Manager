const recentBills = [
  { ref: "BILL-901", vendor: "Fresh Foods", amount: "$420", status: "Pending" },
  { ref: "BILL-902", vendor: "Power Utilities", amount: "$1,100", status: "Paid" },
  { ref: "BILL-903", vendor: "Office Mart", amount: "$265", status: "Pending" },
  { ref: "BILL-904", vendor: "Metro Water", amount: "$160", status: "Paid" },
]

export default function AdminDashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
          Dashboard
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Overview</h1>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Recent Bills</h2>
        <p className="mt-1 text-sm text-slate-500">Latest invoice activities from suppliers.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-130 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-3">Reference</th>
                <th className="py-3">Vendor</th>
                <th className="py-3">Amount</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentBills.map((bill) => (
                <tr key={bill.ref} className="border-b border-slate-100 text-slate-700">
                  <td className="py-3 font-medium text-slate-900">{bill.ref}</td>
                  <td className="py-3">{bill.vendor}</td>
                  <td className="py-3">{bill.amount}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        bill.status === "Paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {bill.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="flex flex-col gap-4 xl:flex-row">
        <article className="flex-1 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-4 space-y-2">
            <button className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
              Add New Bill
            </button>
            <button className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
              Approve Pending Bills
            </button>
            <button className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
              Export Monthly Report
            </button>
          </div>
        </article>

        <article className="flex-1 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Alerts</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>3 invoices are due in the next 24 hours.</li>
            <li>2 suppliers updated payment account details.</li>
            <li>Monthly spend crossed 70% of the budget target.</li>
          </ul>
        </article>
      </div>
    </section>
  )
}
