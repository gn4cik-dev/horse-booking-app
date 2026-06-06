"use client";

import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { supabase } from "@/lib/supabase";

const ADMINS = [
  "928272881799028756"
];

type Horse = {
  id: string;
  name: string;
};

type Booking = {
  id?: string;
  horse_id: string;
  booking_date: string;
  username: string;
  user_id: string;
};

export default function Home() {

  const [user, setUser] =
    useState<any>(null);

  const [horses, setHorses] =
    useState<Horse[]>([]);

  const [bookings, setBookings] =
    useState<Booking[]>([]);

  const [selectedDate, setSelectedDate] =
    useState<Date | undefined>(
      new Date()
    );

  useEffect(() => {

    loadUser();
    loadHorses();
    loadBookings();

    const channel =
      supabase.channel(
        "realtime-bookings"
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings"
        },
        async () => {

          await loadBookings();

        }
      )
      .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );

    };

  }, []);

  async function loginWithDiscord() {

    await supabase.auth.signInWithOAuth({
      provider: "discord"
    });

  }

  async function logout() {

    await supabase.auth.signOut();

    location.reload();

  }

  async function loadUser() {

    const {
      data: { user }
    } = await supabase.auth.getUser();

    setUser(user);

  }

  async function loadHorses() {

    const { data } =
      await supabase
        .from("horses")
        .select("*");

    if (data) {
      setHorses(data);
    }

  }

  async function loadBookings() {

    const { data } =
      await supabase
        .from("bookings")
        .select("*");

    if (data) {
      setBookings(data);
    }

  }

  function formatDate(
    date: Date
  ) {

    const year =
      date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;

  }

  function isBooked(
    horseId: string,
    date: string
  ) {

    return bookings.find(
      (booking) =>
        booking.horse_id ===
          horseId &&
        booking.booking_date ===
          date
    );

  }

  async function createBooking(
    horseId: string
  ) {

    if (!user) {

      alert(
        "Zaloguj się Discordem aby rezerwować."
      );

      await loginWithDiscord();

      return;

    }

    if (!selectedDate) return;

    const date =
      formatDate(selectedDate);

    const existingBooking =
      isBooked(
        horseId,
        date
      );

    if (existingBooking) {

      alert(
        "Ten koń jest już zarezerwowany."
      );

      return;

    }

    const today =
      formatDate(new Date());

    if (date < today) {

      alert(
        "Nie można rezerwować przeszłych dat."
      );

      return;

    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } =
      await supabase
        .from("bookings")
        .insert([
          {
            horse_id: horseId,
            booking_date: date,
            user_id: user.id,
            username:
              user.user_metadata
                .full_name
          }
        ]);

    if (error) {

      alert(error.message);
      return;

    }

    await loadBookings();

  }

  async function cancelBooking(
    horseId: string
  ) {

    if (!user) {

      alert(
        "Zaloguj się Discordem."
      );

      await loginWithDiscord();

      return;

    }

    if (!selectedDate) return;

    const date =
      formatDate(selectedDate);

    const booking =
      isBooked(
        horseId,
        date
      );

    if (!booking) return;

    const isAdmin =
      user &&
      ADMINS.includes(
        user.id
      );

    const isOwner =
      booking.user_id ===
      user.id;

    if (
      !isOwner &&
      !isAdmin
    ) {

      alert(
        "Nie możesz anulować cudzej rezerwacji."
      );

      return;

    }

    const confirmDelete =
      confirm(
        "Anulować rezerwację?"
      );

    if (!confirmDelete)
      return;

    const { error } =
      await supabase
        .from("bookings")
        .delete()
        .eq("horse_id", horseId)
        .eq(
          "booking_date",
          date
        );

    if (error) {

      alert(error.message);
      return;

    }

    await loadBookings();

  }

  function getDotColor(
    horseName: string
  ) {

    if (
      horseName === "Baskara"
    ) {
      return "bg-black";
    }

    if (
      horseName === "Nostrzyk"
    ) {
      return "bg-red-500";
    }

    if (
      horseName === "Warek"
    ) {
      return "bg-yellow-400";
    }

    return "bg-gray-400";

  }

  const selectedDateString =
    selectedDate
      ? formatDate(
          selectedDate
        )
      : "";

  const isAdmin =
    user &&
    ADMINS.includes(
      user.id
    );

  return (

    <div className="max-w-6xl mx-auto p-5 md:p-10">

      {!user && (

        <div className="
          bg-indigo-100
          border
          border-indigo-300
          p-4
          rounded-2xl
          mb-6
          flex
          flex-col
          md:flex-row
          items-start
          md:items-center
          justify-between
          gap-4
        ">

          <p className="font-semibold">

            Możesz przeglądać kalendarz bez logowania.
            Aby rezerwować konie —
            zaloguj się Discordem.

          </p>

          <button
            onClick={loginWithDiscord}
            className="
              bg-indigo-600
              text-white
              px-4
              py-2
              rounded-xl
            "
          >

            Zaloguj Discordem

          </button>

        </div>

      )}

      <div className="
        flex
        flex-col
        md:flex-row
        md:items-center
        md:justify-between
        gap-5
        mb-10
      ">

        <div>

          <h1 className="text-4xl font-bold">
            📅 Rezerwacje koni
          </h1>

          {user && (

            <p className="mt-3 text-lg">

              Zalogowano jako{" "}

              <span className="font-bold">

                {
                  user
                    .user_metadata
                    .full_name
                }

              </span>

            </p>

          )}

        </div>

        {user && (

          <div className="
            flex
            items-center
            gap-4
          ">

            <img
              src={
                user.user_metadata
                  .avatar_url
              }
              alt="avatar"
              className="
                w-16
                h-16
                rounded-full
              "
            />

            <button
              onClick={logout}
              className="
                bg-gray-200
                px-4
                py-2
                rounded-xl
              "
            >

              Wyloguj

            </button>

          </div>

        )}

      </div>

      <div className="
        bg-white
        rounded-3xl
        p-4
        md:p-6
        shadow
        mb-10
        overflow-auto
      ">

        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className="text-black"
          modifiersClassNames={{
            selected:
              "bg-indigo-600 text-white rounded-full"
          }}
          components={{

            DayButton: ({
              day,
              ...props
            }) => {

              const formattedDate =
                formatDate(day.date);

              const dayBookings =
                bookings.filter(
                  (booking) =>
                    booking.booking_date ===
                    formattedDate
                );

              return (

                <button
                  {...props}
                  className="
                    relative
                    w-10
                    h-10
                    hover:bg-indigo-100
                    rounded-full
                    flex
                    items-center
                    justify-center
                  "
                >

                  {day.date.getDate()}

                  {dayBookings.length > 0 && (

                    <div
                      className="
                        absolute
                        bottom-0
                        left-1/2
                        -translate-x-1/2
                        flex
                        gap-1
                      "
                    >

                      {dayBookings.map(
                        (booking) => {

                          const horse =
                            horses.find(
                              (h) =>
                                h.id ===
                                booking.horse_id
                            );

                          return (

                            <div
                              key={
                                booking.horse_id
                              }
                              className={`
                                w-2
                                h-2
                                rounded-full
                                border
                                border-white
                                ${getDotColor(
                                  horse?.name ||
                                    ""
                                )}
                              `}
                            />

                          );

                        }
                      )}

                    </div>

                  )}

                </button>

              );

            }

          }}
        />

      </div>

      <div className="grid gap-5">

        {horses.map(
          (horse) => {

            const booking =
              isBooked(
                horse.id,
                selectedDateString
              );

            const canCancel =
              booking &&
              user &&
              (
                booking.user_id ===
                  user.id ||
                isAdmin
              );

            return (

              <div
                key={horse.id}
                className="
                  border
                  rounded-2xl
                  p-6
                  flex
                  flex-col
                  md:flex-row
                  md:items-center
                  md:justify-between
                  gap-5
                "
              >

                <div>

                  <h2 className="text-2xl font-bold">
                    🐴 {horse.name}
                  </h2>

                  {booking ? (

                    <div className="mt-2">

                      <p className="text-red-600 font-bold">
                        🔴 Zajęty
                      </p>

                      <p>
                        {booking.username}
                      </p>

                    </div>

                  ) : (

                    <p className="text-green-600 font-bold mt-2">
                      🟢 Wolny
                    </p>

                  )}

                </div>

                {booking ? (

                  canCancel ? (

                    <button
                      onClick={() =>
                        cancelBooking(
                          horse.id
                        )
                      }
                      className="
                        bg-red-600
                        text-white
                        px-5
                        py-3
                        rounded-xl
                      "
                    >

                      Anuluj

                    </button>

                  ) : (

                    <div className="
                      text-gray-400
                      font-semibold
                    ">

                      Zarezerwowane

                    </div>

                  )

                ) : (

                  <button
                    onClick={() =>
                      createBooking(
                        horse.id
                      )
                    }
                    className="
                      bg-indigo-600
                      text-white
                      px-5
                      py-3
                      rounded-xl
                    "
                  >

                    Rezerwuj

                  </button>

                )}

              </div>

            );

          }
        )}

      </div>

      <div className="
        mt-10
        flex
        flex-wrap
        gap-6
      ">

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