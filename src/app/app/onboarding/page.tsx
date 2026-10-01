import { OnboardingForm } from "@/components/onboarding-form";
import { Banner, PageTitle } from "@/components/ui";
import { agentFillsProfile } from "@/lib/plans";
import { loadDashboard, loadOnboarding } from "@/lib/queries/cabinet";
import { claimedLocation } from "@/lib/services/guest-draft";
import { requireClient } from "@/lib/session";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireClient();
  const [data, dash] = await Promise.all([loadOnboarding(user.id), loadDashboard(user.id)]);
  const params = await searchParams;
  const cities = data.cities || (await claimedLocation(user.id)) || "";
  return (
    <main className="grid gap-4">
      <PageTitle title="Анкета" text="Заполните один раз. Пароль Авито и коды из SMS сюда вводить не нужно." />
      <Banner message={params.error} />
      <OnboardingForm
        canAgentFill={
          agentFillsProfile(dash.plan) ||
          (dash.trial && dash.subscriptionStatus === "active" && (dash.periodEnd?.getTime() ?? 0) > Date.now())
        }
        initial={{
          company: data.companyName,
          phone: data.phone,
          telegram: data.telegram,
          avitoPhone: data.avitoPhone,
          workMode: data.workMode,
          cities,
          categories: data.categories,
          replyRules: data.replyRules,
          escalateRules: data.escalateRules,
        }}
      />
    </main>
  );
}
