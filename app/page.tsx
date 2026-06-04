"use client";

import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { supabase } from "@/lib/supabase";

type Horse = {
  id: string;
  name: string;
};

type Booking = {
  id?: string;
  horse_id: string;
  booking_date: string;
  username: string;
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

    if (!selectedDate) return;

    const date =
      formatDate(selectedDate);

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

  if (!user) {

    return (

      <div className="
        h-screen
        flex
        items-center
        justify-center
        bg-gray-100
      ">

        <button
          onClick={loginWithDiscord}
          className="
            bg-indigo-600
            text-white
            px-8
            py-5
            rounded-2xl
            text-2xl
            font-bold
            shadow-lg
          "
        >

          Zaloguj Discordem

        </button>

      </div>

    );

  }

  return (

    <div className="max-w-6xl mx-auto p-5 md:p-10">

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

        </div>

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
          <div className="w-3 h-3 rounded-full bg-black" />
          <p>Baskara</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <p>Nostrzyk</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <p>Warek</p>
        </div>

      </div>

    </div>

  );

}
