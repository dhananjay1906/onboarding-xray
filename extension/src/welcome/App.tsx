import FirstRunStep from "./components/FirstRunStep";
import ProjectStep from "./components/ProjectStep";
import SetupStep from "./components/SetupStep";

export default function App() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6 sm:p-8">
      <header>
        <h1 className="text-3xl font-bold">Welcome to Onboarding X-Ray</h1>
        <p className="mt-2 text-slate-600">
          Alt+click any element in a running app and see the code behind it: component, API call, route, functions and database table. Three short
          steps. You can reopen this tour any time with the <strong>?</strong> button in the side panel.
        </p>
      </header>

      <SetupStep />
      <FirstRunStep />
      <ProjectStep />

      <p className="text-sm text-slate-500">Click the Onboarding X-Ray icon in the Chrome toolbar to open the side panel.</p>
    </main>
  );
}
