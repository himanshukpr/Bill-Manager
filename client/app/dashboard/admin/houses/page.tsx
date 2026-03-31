const houses = [
  {
    id: "H-101",
    name: "Maple Residency",
    owner: "Aarav Sharma",
    units: 12,
    status: "Active",
  },
  {
    id: "H-102",
    name: "Green View Villa",
    owner: "Meera Kapoor",
    units: 8,
    status: "Active",
  },
  {
    id: "H-103",
    name: "Sunrise Heights",
    owner: "Rohan Verma",
    units: 16,
    status: "Maintenance",
  },
]

export default function HousesPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Houses</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">House Directory</h1>
        <p className="mt-2 text-sm text-slate-600">A clean overview of registered houses.</p>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-130 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-3">House ID</th>
                <th className="py-3">Name</th>
                <th className="py-3">Owner</th>
                <th className="py-3">Units</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {houses.map((house) => (
                <tr key={house.id} className="border-b border-slate-100 text-slate-700">
                  <td className="py-3 font-medium text-slate-900">{house.id}</td>
                  <td className="py-3">{house.name}</td>
                  <td className="py-3">{house.owner}</td>
                  <td className="py-3">{house.units}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        house.status === "Active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {house.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}