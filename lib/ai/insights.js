import { GoogleGenerativeAI } from "@google/generative-ai";
import { formatMoney } from "@/lib/format";

/**
 * Asks Gemini for short, practical insights grounded ONLY in the figures of a statement.
 * Returns an empty list when AI is not configured or the call fails — the page then shows
 * nothing rather than invented numbers.
 */
export async function insightsFromStatement({ label, statement }) {
  if (!process.env.GEMINI_API_KEY) return { insights: [], error: "AI insights are not configured (GEMINI_API_KEY missing)." };
  const i = statement.income;
  const p = i.previous || {};
  const f = (v) => formatMoney(v || 0);
  const lines = [
    `Period: ${label}`,
    `Money in ${f(i.moneyIn)} (previous period ${f(p.moneyIn)}): sales ${f(i.salesGross)}, rent ${f(i.rentIncome)}, other income ${f(i.otherIncome)}`,
    `Money out ${f(i.moneyOut)} (previous ${f(p.moneyOut)}): discounts ${f(i.discounts)}, purchases ${f(i.purchases)}, expenses ${f(i.expenses)}, other expenses ${f(i.otherExpenses)}`,
    `Result ${f(i.result)} (previous ${f(p.result)}), margin ${i.margin ?? 0}%`,
    `Cash: handed to the Boss ${f(statement.cash.handedOver)}, pending confirmation ${f(statement.cash.pending)}`,
    `Debts owed by customers at the end: ${f(statement.debts.closing)} (given ${f(statement.debts.given)}, repaid ${f(statement.debts.repaid)})`,
    `Stock value at the end: ${f(statement.stock.totals.value)}`,
    statement.stock.topDishes.length ? `Best-selling dishes: ${statement.stock.topDishes.slice(0, 5).map((d) => `${d.name} ${d.sold} plates`).join("; ")}` : "",
    statement.perDepartment.length > 1 ? `Departments: ${statement.perDepartment.map((d) => `${d.name} result ${f(d.result)}`).join("; ")}` : "",
  ].filter(Boolean);
  const prompt = `You advise the owner of a restaurant business in Cameroon. All amounts are FCFA.
Using ONLY the figures below (never invent numbers), give 3 short, practical insights
(maximum 35 words each) about sales, costs, cash and debts. Answer as a JSON array of strings.

${lines.join("\n")}`;
  try {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(text);
    return { insights: Array.isArray(parsed) ? parsed.map(String).slice(0, 5) : [] };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "ai_insights_failed", message: error.message }));
    return { insights: [], error: "Could not generate insights right now." };
  }
}
