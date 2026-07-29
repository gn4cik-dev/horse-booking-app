// supabase/functions/notify-discord/index.ts
//
// Wywoływana przez Supabase Database Webhook przy INSERT, UPDATE i
// DELETE na tabeli `bookings` (patrz README-DEPLOY.md, krok "Discord").
//
// Architektura powiadomień (po doprecyzowaniu):
// - Wiadomość na kanale wysyłana jest ZAWSZE, dla każdej nowej
//   rezerwacji i każdego anulowania — kanał to wspólny dziennik
//   widoczny dla wszystkich, niezależnie od czyichkolwiek preferencji.
// - Do KAŻDEJ wiadomości (nowa rezerwacja i anulowanie) doklejana jest
//   lista @wzmianek (Discord mentions) użytkowników, którzy subskrybują
//   POWIADOMIENIA DLA TEGO KONKRETNEGO KONIA (tabela
//   user_horse_subscriptions), z pominięciem osoby, której dotyczy
//   rezerwacja. Użytkownik wybiera sam, ile i które konie go interesują
//   — żaden, jeden, kilka albo wszystkie — zamiast jednego przełącznika
//   "wszystko albo nic".
//   To realizuje "wszyscy dostają powiadomienie, chyba że się wyciszą"
//   bez budowania osobnego kanału DM/bota — jeden webhook wystarcza,
//   bo Discord i tak wysyła użytkownikowi powiadomienie push za każdym
//   razem, gdy zostanie @wspomniany. Dyskord nie ma natywnej opcji
//   "wycisz tylko tego bota" (ustawienia powiadomień są per-kanał, nie
//   per-nadawca) — ta wzmianka jest naszym odpowiednikiem: kanał
//   zawsze pokazuje wszystko, a wyciszenie w appce steruje wyłącznie
//   tym, kto dostaje realny "ping".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type BookingRow = {
  id: string;
  horse_id: string;
  booking_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;
  username: string;
  user_id: string;
  booking_type: string;
  ride_type: string | null;
};

function formatDatePl(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function formatTime(t: string) {
  return t?.slice(0, 5) ?? "";
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { type, record, old_record } = payload as {
      type: "INSERT" | "UPDATE" | "DELETE";
      record: BookingRow | null;
      old_record: BookingRow | null;
    };

    if (type !== "INSERT" && type !== "UPDATE" && type !== "DELETE") {
      return new Response("ignored", { status: 200 });
    }

    const row = type === "DELETE" ? old_record : record;
    if (!row) return new Response("no row", { status: 200 });

    const { data: horse } = await supabase
      .from("horses")
      .select("name")
      .eq("id", row.horse_id)
      .maybeSingle();

    const isCancel = type === "DELETE";
    const isEdit = type === "UPDATE";
    const typeLabel = row.ride_type ?? row.booking_type;

    let content = [
      isCancel
        ? "❌ **Rezerwacja anulowana**"
        : isEdit
        ? "✏️ **Rezerwacja zmieniona**"
        : "🐴 **Nowa rezerwacja**",
      "",
      `**Użytkownik:** ${row.username}`,
      `**Koń:** ${horse?.name ?? "?"}`,
      `**Data:** ${formatDatePl(row.booking_date)}`,
      `**Godzina:** ${formatTime(row.start_time)}–${formatTime(row.end_time)}`,
      `**Typ:** ${typeLabel}`,
    ].join("\n");

    // Wzmianki: kto subskrybuje TEGO konia, z pominięciem osoby, której
    // dotyczy rezerwacja (nie ma sensu wzmiankować kogoś o jego własnej
    // rezerwacji/anulowaniu).
    const { data: subs } = await supabase
      .from("user_horse_subscriptions")
      .select("user_id")
      .eq("horse_id", row.horse_id)
      .neq("user_id", row.user_id);

    const subscriberIds = (subs ?? []).map((s) => s.user_id);

    let mentions: string[] = [];
    if (subscriberIds.length > 0) {
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("discord_user_id")
        .in("user_id", subscriberIds)
        .not("discord_user_id", "is", null);

      mentions = (prefs ?? [])
        .map((p) => p.discord_user_id)
        .filter(Boolean)
        .map((id) => `<@${id}>`);
    }

    if (mentions.length > 0) {
      content += `\n\n🔔 ${mentions.join(" ")}`;
    }

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // allowed_mentions ogranicza wzmianki wyłącznie do wymienionych
      // użytkowników — bez tego Discord domyślnie też by to zrobił dla
      // <@id>, ale jawne ograniczenie chroni przed przypadkowym @everyone,
      // gdyby kiedyś trafiło do treści wiadomości.
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: ["users"] },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Discord webhook error", res.status, text);
      return new Response("discord error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
