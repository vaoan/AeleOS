import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import { FursonaForm } from "@/features/actors";
import { createFursonaAction } from "@/app/[locale]/(app)/fursonas/actions";
import { fursonaFormLabels } from "@/app/[locale]/(app)/fursonas/labels";

/**
 * The page for creating a fursona.
 *
 * Its labels come from `fursonaFormLabels("submitCreate")`, shared with the
 * edit page rather than each page keeping its own near-identical copy.
 *
 * @returns the create page.
 */
export default async function NewFursonaPage() {
  const t = await getTranslations("fursonas");
  return (
    <Card>
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {t("create")}
      </h1>
      <FursonaForm
        action={createFursonaAction}
        labels={await fursonaFormLabels("submitCreate")}
        handleEditable
      />
    </Card>
  );
}
