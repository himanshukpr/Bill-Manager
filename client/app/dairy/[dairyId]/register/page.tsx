import { UserRegisterForm } from "@/components/auth/user-register-form"

type Props = {
  params: Promise<{ dairyId: string }>
}

export default async function RegisterPage({ params }: Props) {
  const { dairyId } = await params
  return (
    <main className="flex min-h-svh items-center justify-center bg-[radial-gradient(circle_at_top,#f7fafc_0%,#eef2f7_45%,#e8edf5_100%)] px-4 py-10 text-slate-900 dark:bg-[radial-gradient(circle_at_top,#111827_0%,#0f172a_45%,#020617_100%)] dark:text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <UserRegisterForm dairyId={Number(dairyId)} />
      </div>
    </main>
  )
}
