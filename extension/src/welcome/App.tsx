const steps = [
  { title: "Check your setup", body: "Chrome version and on-device model status will appear here." },
  { title: "Try it", body: "Open the demo store and Alt+click the Checkout button to see its trace." },
  { title: "Your project", body: "Run the analyzer on your own app and load its graph.json." },
];

export default function App() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">Welcome to Onboarding X-Ray</h1>
        <p className="mt-2 text-slate-600">
          Alt+click any element in a running app and see the code behind it: component, API call, route,
          functions and database table.
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">
              {i + 1}. {step.title}
            </h2>
            <p className="text-sm text-slate-600">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="text-sm text-slate-500">Click the Onboarding X-Ray icon in the Chrome toolbar to open the side panel.</p>
    </main>
  );
}
