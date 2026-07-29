"use client";

import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { pl } from "date-fns/locale";
import "react-day-picker/dist/style.css";

import { supabase } from "@/lib/supabase";
import { formatDate, rangesOverlap, startOfLocalDay } from "@/lib/time";

const ADMINS = ["92c7eb45-d9d7-4f11-b377-85d021ae7f42"];

const RIDE_TYPES = ["Spacer", "Groundwork", "Plac", "Teren"] as const;
type RideType = (typeof RIDE_TYPES)[number];

const ADMIN_CATEGORIES = [
  "Rezerwacja",
  "Kowal",
  "Fizjoterapia",
  "Weterynarz",
  "Niedostępny",
] as const;
type ReservationCategory = (typeof ADMIN_CATEGORIES)[number];

type Horse = {
  id: string;
  name: string;
};

type Booking = {
  id: string;
  horse_id: string;
  booking_date: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  username: string;
  user_id: string;
  booking_type: ReservationCategory;
  ride_type: RideType | null;
};

// Domyślne godziny zaproponowane w formularzu nowej rezerwacji.
const DEFAULT_START = "09:00";
const DEFAULT_END = "10:00";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // `today` i `selectedDate` startują jako undefined PO OBU STRONACH
  // (serwer i klient) i są ustawiane dopiero w useEffect, czyli
  // wyłącznie na kliencie, jego własnym czasem lokalnym. To naprawia
  // Zmianę 2: poprzednio `useState(new Date())` liczyło "dzisiaj" już
  // podczas renderu, który dla komponentu klienckiego wykonuje się też
  // na serwerze (inna strefa czasowa) — przy renderach blisko północy
  // serwer i przeglądarka użytkownika potrafiły wskazać różny dzień.
  const [today, setToday] = useState<Date | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    undefined
  );

  const [authError, setAuthError] = useState("");

  const [subscribedHorseIds, setSubscribedHorseIds] = useState<Set<string>>(
    new Set()
  );
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Stan formularza "Dodaj rezerwację" / "Edytuj rezerwację" — jeden i
  // ten sam formularz obsługuje oba tryby. `editingBookingId` ustawione
  // = jesteśmy w trybie edycji istniejącej rezerwacji (edytujemy tylko
  // jej godziny/typ, nie zmieniamy konia ani daty).
  const [formHorseId, setFormHorseId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(
    null
  );
  const [formStart, setFormStart] = useState(DEFAULT_START);
  const [formEnd, setFormEnd] = useState(DEFAULT_END);
  const [formRideType, setFormRideType] = useState<RideType | "">("");
  const [formCategory, setFormCategory] =
    useState<ReservationCategory>("Rezerwacja");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get("error_description");

    if (errorDescription?.includes("Error getting user email")) {
      setAuthError(
        "Nie udało się zalogować. Sprawdź w Discord → Ustawienia → Moje konto, czy adres e-mail jest zweryfikowany."
      );
      window.history.replaceState({}, "", window.location.pathname);
    }

    const now = new Date();
    const localToday = startOfLocalDay(now);
    setToday(localToday);
    setSelectedDate(localToday);

    loadUser();
    loadHorses();
    loadBookings();

    const channel = supabase.channel("realtime-bookings");

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        async () => {
          await loadBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (user) {
      ensurePreferences(user);
    }
  }, [user?.id]);

  async function loginWithDiscord() {
    // Bez tego Supabase zawsze wraca pod "Site URL" ustawiony w
    // dashboardzie (czyli Twój adres na Vercelu), nawet gdy logujesz
    // się z localhost. Jawne redirectTo sprawia, że wraca dokładnie
    // tam, skąd wystartowałeś logowanie.
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    location.reload();
  }

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadHorses() {
    const { data } = await supabase.from("horses").select("*");
    if (data) setHorses(data);
  }

  async function loadBookings() {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .order("start_time", { ascending: true });
    if (data) setBookings(data as Booking[]);
  }

  // Zapewnia istnienie wiersza user_preferences (dla discord_user_id) i
  // wczytuje, których koni użytkownik obecnie "słucha" na Discordzie.
  // Dla zupełnie nowego użytkownika (brak wiersza user_preferences)
  // domyślnie subskrybujemy go do WSZYSTKICH koni istniejących w tym
  // momencie — dalej może dowolnie odznaczyć. Dla powracającego
  // użytkownika nigdy nie zmieniamy jego wyboru, tylko go odczytujemy.
  async function ensurePreferences(currentUser: any) {
    const discordUserId: string | undefined =
      currentUser.user_metadata?.provider_id ?? currentUser.user_metadata?.sub;

    const { data: existing } = await supabase
      .from("user_preferences")
      .select("discord_user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from("user_preferences").insert({
        user_id: currentUser.id,
        discord_user_id: discordUserId ?? null,
      });

      const { data: allHorses } = await supabase.from("horses").select("id");

      if (allHorses && allHorses.length > 0) {
        await supabase.from("user_horse_subscriptions").insert(
          allHorses.map((h) => ({ user_id: currentUser.id, horse_id: h.id }))
        );
        setSubscribedHorseIds(new Set(allHorses.map((h) => h.id)));
      }

      return;
    }

    if (discordUserId && existing.discord_user_id !== discordUserId) {
      await supabase
        .from("user_preferences")
        .update({ discord_user_id: discordUserId })
        .eq("user_id", currentUser.id);
    }

    const { data: subs } = await supabase
      .from("user_horse_subscriptions")
      .select("horse_id")
      .eq("user_id", currentUser.id);

    setSubscribedHorseIds(new Set((subs ?? []).map((s) => s.horse_id)));
  }

  async function toggleHorseSubscription(horseId: string) {
    if (!user) return;

    const isSubscribed = subscribedHorseIds.has(horseId);
    const next = new Set(subscribedHorseIds);
    isSubscribed ? next.delete(horseId) : next.add(horseId);

    setSavingPrefs(true);
    setSubscribedHorseIds(next); // optymistycznie

    const { error } = isSubscribed
      ? await supabase
          .from("user_horse_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("horse_id", horseId)
      : await supabase
          .from("user_horse_subscriptions")
          .insert({ user_id: user.id, horse_id: horseId });

    setSavingPrefs(false);

    if (error) {
      setSubscribedHorseIds(subscribedHorseIds); // cofnij przy błędzie
      alert(error.message);
    }
  }

  async function setAllHorseSubscriptions(subscribeToAll: boolean) {
    if (!user) return;

    setSavingPrefs(true);
    const previous = subscribedHorseIds;

    if (subscribeToAll) {
      setSubscribedHorseIds(new Set(horses.map((h) => h.id)));
      const { error } = await supabase
        .from("user_horse_subscriptions")
        .upsert(
          horses.map((h) => ({ user_id: user.id, horse_id: h.id })),
          { onConflict: "user_id,horse_id" }
        );
      setSavingPrefs(false);
      if (error) {
        setSubscribedHorseIds(previous);
        alert(error.message);
      }
      return;
    }

    setSubscribedHorseIds(new Set());
    const { error } = await supabase
      .from("user_horse_subscriptions")
      .delete()
      .eq("user_id", user.id);
    setSavingPrefs(false);
    if (error) {
      setSubscribedHorseIds(previous);
      alert(error.message);
    }
  }

  function bookingsForHorseOnDate(horseId: string, date: string): Booking[] {
    return bookings
      .filter((b) => b.horse_id === horseId && b.booking_date === date)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  function openAddForm(horseId: string) {
    setFormHorseId(horseId);
    setEditingBookingId(null);
    setFormStart(DEFAULT_START);
    setFormEnd(DEFAULT_END);
    setFormRideType("");
    setFormCategory("Rezerwacja");
    setFormError("");
  }

  function openEditForm(booking: Booking) {
    setFormHorseId(booking.horse_id);
    setEditingBookingId(booking.id);
    setFormStart(booking.start_time.slice(0, 5));
    setFormEnd(booking.end_time.slice(0, 5));
    setFormRideType(booking.ride_type ?? "");
    setFormCategory(booking.booking_type);
    setFormError("");
  }

  function closeAddForm() {
    setFormHorseId(null);
    setEditingBookingId(null);
    setFormError("");
  }

  async function submitBooking(horseId: string) {
    if (!user) {
      alert("Zaloguj się");
      await loginWithDiscord();
      return;
    }

    if (!selectedDate || !today) return;

    const isAdmin = ADMINS.includes(user.id);
    const isEditing = Boolean(editingBookingId);

    const editedBooking = isEditing
      ? bookings.find((b) => b.id === editingBookingId)
      : undefined;

    if (isEditing && !editedBooking) {
      setFormError("Ta rezerwacja już nie istnieje — odśwież stronę.");
      return;
    }

    if (isEditing && editedBooking) {
      const canEdit = editedBooking.user_id === user.id || isAdmin;
      if (!canEdit) {
        setFormError("Nie możesz edytować cudzej rezerwacji.");
        return;
      }
    }

    // Edycja zmienia tylko godziny/typ — data i koń pozostają te, do
    // których rezerwacja już należy (widoczne w tym samym dniu).
    const date = isEditing ? editedBooking!.booking_date : formatDate(selectedDate);
    const category: ReservationCategory = isAdmin ? formCategory : "Rezerwacja";

    if (!isEditing && !isAdmin && date < formatDate(today)) {
      setFormError("Nie można rezerwować przeszłych dat.");
      return;
    }

    if (formStart >= formEnd) {
      setFormError('Godzina "do" musi być późniejsza niż "od".');
      return;
    }

    if (category === "Rezerwacja" && !formRideType) {
      setFormError("Wybierz typ jazdy — to pole jest wymagane.");
      return;
    }

    const existing = bookingsForHorseOnDate(horseId, date).filter(
      (b) => b.id !== editingBookingId
    );
    const conflict = existing.some((b) =>
      rangesOverlap(formStart, formEnd, b.start_time, b.end_time)
    );

    if (conflict) {
      setFormError("Ten koń ma już rezerwację nakładającą się na wybrane godziny.");
      return;
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) return;

    const { error } = isEditing
      ? await supabase
          .from("bookings")
          .update({
            start_time: formStart,
            end_time: formEnd,
            booking_type: category,
            ride_type: category === "Rezerwacja" ? formRideType : null,
          })
          .eq("id", editingBookingId)
      : await supabase.from("bookings").insert([
          {
            horse_id: horseId,
            booking_date: date,
            start_time: formStart,
            end_time: formEnd,
            user_id: currentUser.id,
            username: currentUser.user_metadata.full_name,
            booking_type: category,
            ride_type: category === "Rezerwacja" ? formRideType : null,
          },
        ]);

    if (error) {
      // 23P01 = naruszenie EXCLUDE CONSTRAINT (nakładające się godziny) —
      // ostatnia linia obrony, gdyby ktoś zdążył zarezerwować/zmienić na
      // ten sam slot w międzyczasie.
      if (error.code === "23P01") {
        setFormError("Ktoś właśnie zarezerwował nakładający się termin. Odśwież i spróbuj ponownie.");
      } else {
        setFormError(error.message);
      }
      return;
    }

    closeAddForm();
    await loadBookings();
  }

  async function cancelBooking(booking: Booking) {
    if (!user) {
      alert("Zaloguj się.");
      await loginWithDiscord();
      return;
    }

    const isAdmin = ADMINS.includes(user.id);
    const isOwner = booking.user_id === user.id;

    if (!isOwner && !isAdmin) {
      alert("Nie możesz anulować cudzej rezerwacji.");
      return;
    }

    const confirmDelete = confirm("Anulować rezerwację?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("bookings").delete().eq("id", booking.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadBookings();
  }

  function getDotColor(horseName: string) {
    if (horseName === "Baskara") return "bg-black";
    if (horseName === "Nostrzyk") return "bg-red-500";
    if (horseName === "Warek") return "bg-yellow-400";
    return "bg-gray-400";
  }

  const selectedDateString = selectedDate ? formatDate(selectedDate) : "";
  const isAdmin = user && ADMINS.includes(user.id);

  return (
    <div className="max-w-6xl mx-auto p-5 md:p-10">
      {authError && (
        <div className="bg-red-100 border border-red-300 text-red-800 p-4 rounded-2xl mb-6">
          ❌ {authError}
        </div>
      )}

      {!user && (
        <div className="bg-indigo-100 border border-indigo-300 p-4 rounded-2xl mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="font-semibold">
            Możesz przeglądać kalendarz bez logowania. Aby rezerwować konie —
            zaloguj się przez Discorda.
          </p>
          <button
            onClick={loginWithDiscord}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl"
          >
            Zaloguj
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-10">
        <div>
          <h1 className="text-4xl font-bold">📅 Horsysie rezerwacje</h1>

          {user && (
            <p className="mt-3 text-lg">
              Zalogowano jako{" "}
              <span className="font-bold">{user.user_metadata.full_name}</span>
            </p>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-4">
            <details className="relative bg-gray-100 rounded-xl px-3 py-2 text-sm">
              <summary className="cursor-pointer select-none font-semibold">
                🔔 Powiadomienia Discord ({subscribedHorseIds.size}/{horses.length})
              </summary>

              <div className="absolute right-0 mt-2 w-64 bg-white border rounded-xl shadow-lg p-3 z-10">
                <p className="text-xs text-gray-500 mb-2">
                  Oznaczaj mnie (@) na Discordzie przy nowych rezerwacjach i
                  anulowaniach dla wybranych koni:
                </p>

                <div className="grid gap-1 mb-2">
                  {horses.map((horse) => (
                    <label
                      key={horse.id}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={subscribedHorseIds.has(horse.id)}
                        disabled={savingPrefs}
                        onChange={() => toggleHorseSubscription(horse.id)}
                      />
                      {horse.name}
                    </label>
                  ))}
                </div>

                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setAllHorseSubscriptions(true)}
                    disabled={savingPrefs}
                    className="underline"
                  >
                    Zaznacz wszystkie
                  </button>
                  <button
                    onClick={() => setAllHorseSubscriptions(false)}
                    disabled={savingPrefs}
                    className="underline"
                  >
                    Odznacz wszystkie
                  </button>
                </div>
              </div>
            </details>

            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="w-16 h-16 rounded-full"
            />

            <button
              onClick={logout}
              className="bg-gray-200 px-4 py-2 rounded-xl"
            >
              Wyloguj
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl p-4 md:p-6 shadow mb-10 overflow-auto">
        <DayPicker
          mode="single"
          locale={pl}
          weekStartsOn={1}
          selected={selectedDate}
          onSelect={setSelectedDate}
          disabled={!isAdmin && today ? { before: today } : undefined}
          className="text-black"
          modifiers={today ? { today: [today] } : undefined}
          modifiersClassNames={{
            selected: "bg-indigo-600 text-white rounded-full",
            today: "font-bold text-indigo-600 underline",
          }}
          components={{
            DayButton: ({ day, ...props }) => {
              const formattedDate = formatDate(day.date);
              const dayBookings = bookings.filter(
                (booking) => booking.booking_date === formattedDate
              );

              return (
                <button
                  {...props}
                  className="relative w-10 h-10 hover:bg-indigo-100 rounded-full flex items-center justify-center"
                >
                  {day.date.getDate()}

                  {dayBookings.length > 0 && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-1">
                      {[...new Set(dayBookings.map((b) => b.horse_id))].map(
                        (horseId) => {
                          const horse = horses.find((h) => h.id === horseId);
                          return (
                            <div
                              key={horseId}
                              className={`w-2 h-2 rounded-full border border-white ${getDotColor(
                                horse?.name || ""
                              )}`}
                            />
                          );
                        }
                      )}
                    </div>
                  )}
                </button>
              );
            },
          }}
        />
      </div>

      <div className="grid gap-5">
        {horses.map((horse) => {
          const dayBookings = bookingsForHorseOnDate(
            horse.id,
            selectedDateString
          );
          const isFormOpen = formHorseId === horse.id;

          return (
            <div key={horse.id} className="border rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <h2 className="text-2xl font-bold">🐴 {horse.name}</h2>

                <button
                  onClick={() =>
                    isFormOpen ? closeAddForm() : openAddForm(horse.id)
                  }
                  className="bg-indigo-600 text-white px-5 py-3 rounded-xl self-start md:self-auto"
                >
                  {isFormOpen ? "Anuluj" : "Dodaj rezerwację"}
                </button>
              </div>

              {dayBookings.length === 0 ? (
                <p className="text-green-600 font-bold mt-4">
                  🟢 Brak rezerwacji tego dnia
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {dayBookings.map((booking) => {
                    const canCancel =
                      user &&
                      (booking.user_id === user.id || isAdmin);

                    return (
                      <div
                        key={booking.id}
                        className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                      >
                        <div>
                          <p className="font-semibold">
                            {booking.start_time.slice(0, 5)}–
                            {booking.end_time.slice(0, 5)}
                          </p>
                          <p>
                            {booking.booking_type === "Rezerwacja"
                              ? booking.username
                              : booking.booking_type}
                            {booking.ride_type && (
                              <span className="text-gray-500">
                                {" "}
                                · {booking.ride_type}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          {canCancel && (
                            <button
                              onClick={() => openEditForm(booking)}
                              className="bg-gray-200 px-4 py-2 rounded-xl"
                            >
                              Edytuj
                            </button>
                          )}

                          {canCancel && (
                            <button
                              onClick={() => cancelBooking(booking)}
                              className="bg-red-600 text-white px-4 py-2 rounded-xl"
                            >
                              Anuluj
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isFormOpen && (
                <div className="mt-5 border-t pt-5 grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2 -mb-2">
                    {editingBookingId
                      ? "Edytuj rezerwację"
                      : "Nowa rezerwacja"}
                  </h3>

                  <div>
                    <label className="block text-sm font-semibold mb-1">
                      Od
                    </label>
                    <input
                      type="time"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="border rounded-xl px-3 py-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1">
                      Do
                    </label>
                    <input
                      type="time"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="border rounded-xl px-3 py-2 w-full"
                    />
                  </div>

                  {isAdmin && (
                    <div>
                      <label className="block text-sm font-semibold mb-1">
                        Kategoria (admin)
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) =>
                          setFormCategory(
                            e.target.value as ReservationCategory
                          )
                        }
                        className="border rounded-xl px-3 py-2 w-full"
                      >
                        {ADMIN_CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formCategory === "Rezerwacja" && (
                    <div>
                      <label className="block text-sm font-semibold mb-1">
                        Typ jazdy *
                      </label>
                      <select
                        value={formRideType}
                        onChange={(e) =>
                          setFormRideType(e.target.value as RideType)
                        }
                        className="border rounded-xl px-3 py-2 w-full"
                      >
                        <option value="">Wybierz typ…</option>
                        {RIDE_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formError && (
                    <p className="text-red-600 font-semibold md:col-span-2">
                      {formError}
                    </p>
                  )}

                  <div className="md:col-span-2">
                    <button
                      onClick={() => submitBooking(horse.id)}
                      className="bg-indigo-600 text-white px-5 py-3 rounded-xl"
                    >
                      {editingBookingId ? "Zapisz zmiany" : "Zapisz rezerwację"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-black border border-white" />
          <p>Baskara</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 border border-white" />
          <p>Nostrzyk</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-400 border border-white" />
          <p>Warek</p>
        </div>
      </div>
    </div>
  );
}
