export default function Placeholder({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-5xl shadow-sm">
        {icon}
      </div>
      <h1 className="text-xl font-extrabold text-slate-800">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        هذه الوحدة قيد التطوير — سيتم تفعيلها في المراحل القادمة من المشروع.
      </p>
    </div>
  )
}
