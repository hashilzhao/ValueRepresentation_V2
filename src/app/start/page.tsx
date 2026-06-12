import ParticipantForm from "@/components/ParticipantForm";
import EntryPasswordGate from "@/components/EntryPasswordGate";
import ResumeForm from "@/components/ResumeForm";

export default function StartPage() {
  return (
    <EntryPasswordGate>
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-gray-900">
              被试信息登记
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              新被试请填写以下信息。已有编号？点击下方继续实验。
            </p>
          </div>
          <ParticipantForm />
          <div className="mt-8 pt-6 border-t border-gray-200">
            <ResumeForm />
          </div>
        </div>
      </main>
    </EntryPasswordGate>
  );
}
