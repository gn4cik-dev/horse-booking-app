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
  horse_id: string;
  booking_date: string;
  username: string;
};

export default function Dashboard() {

  const [user, setUser] = useState<any>(null);

  const [horses, setHorses] = useState<Horse[]>([]);

  const [bookings, setBookings] =
    useState<Booking[]>([]);

  const [selectedDate, setSelectedDate] =
    useState<Date | undefined>(new Date());

  useEffect(() => {

    loadUser();
    loadHorses();
    loadBookings();

  }, []);

  async function loadUser() {

    const {
      data: { user }
    } = await supabase.auth.getUser();

    setUser(user);

  }

  async function loadHorses() {

    const { data } = await supabase
      .from("horses")
      .select("*");

    if (data) {
      setHorses(data);
    }

  }

  async function loadBookings() {

    const { data } = await supabase
      .from("bookings")
      .select("*");

    if (data) {
      setBookings(data);
    }

  }

  function formatDate(date: Date) {

    return date
      .toISOString()
      .split("T")[0];

  }

  function isBooked(
    horseId: string,
    date: string
  ) {

    return bookings.find(
      (booking) =>
        booking.horse_id === horseId &&
        booking.booking_date === date
    );

  }

  async function createBooking(
    horseId: string
  ) {

    if (!selectedDate) {
      return;
    }

    const date = formatDate(selectedDate);

    const existingBooking = isBooked(
      horseId,
      date
    );

    if (existingBooking) {

      alert(
        "Ten koń jest już zarezerwowany."
      );

      return;

    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("bookings")
      .insert([
        {
          horse_id: horseId,
          booking_date: date,
          user_id: user.id,
          username:
            user.user_metadata.full_name
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

    const date = formatDate(selectedDate);

    const confirmDelete = confirm(
      "Anulować rezerwację?"
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("horse_id", horseId)
      .eq("booking_date", date);

    if (error) {

      alert(error.message);
      return;

    }

    await loadBookings();

  }

  function getDotsForDate(
    date: Date
  ) {

    const formattedDate =
      formatDate(date);

    const dayBookings =
      bookings.filter(
        (booking) =>
          booking.booking_date ===
          formattedDate
      );

    return (
      <div className="flex justify-center gap-1 mt-1">

        {dayBookings.map((booking) => {

          const horse = horses.find(
            (h) =>
              h.id === booking.horse_id
          );

          let color =
            "bg-gray-400";

          if (
            horse?.name === "Baskara"
          ) {
            color = "bg-black";
          }

          if (
            horse?.name === "Nostrzyk"
          ) {
            color = "bg-red-500";
          }

          if (
            horse?.name === "Warek"
          ) {
            color = "bg-yellow-400";
          }

          return (
            <div
              key={booking.horse_id}
              className={`w-2 h-2 rounded-full ${color}`}
            />
          );

        })}

      </div>
    );

  }

  const selectedDateString =
    selectedDate
      ? formatDate(selectedDate)
      : "";

  return (
    <div className="max-w-6xl mx-auto p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-4xl font-bold">
            📅 Rezerwacje koni
          </h1>

          {user && (

            <p className="mt-3 text-lg">

              Zalogowano jako{" "}

              <span className="font-bold">

                {
                  user.user_metadata
                    .full_name
                }

              </span>

            </p>

          )}

        </div>

        {user && (

          <img
            src={
              user.user_metadata
                .avatar_url
            }
            alt="avatar"
            className="w-16 h-16 rounded-full"
          />

        )}

      </div>

      <div className="bg-white rounded-3xl p-6 shadow mb-10">

        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          modifiers={{
            booked: bookings.map(
              (booking) =>
                new Date(
                  booking.booking_date
                )
            )
          }}
          components={{
            DayContent: (props) => (

              <div>

                <div>
                  {props.date.getDate()}
                </div>

                {getDotsForDate(
                  props.date
                )}

              </div>

            )
          }}
        />

      </div>

      <div className="grid gap-5">

        {horses.map((horse) => {

          const booking = isBooked(
            horse.id,
            selectedDateString
          );

          return (

            <div
              key={horse.id}
              className="border rounded-2xl p-6 flex items-center justify-between"
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
                  className="bg-red-600 text-white px-5 py-3 rounded-xl"
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
                  className="bg-indigo-600 text-white px-5 py-3 rounded-xl"
                >
                  Rezerwuj
                </button>

              )}

            </div>

          );

        })}

      </div>

      <div className="mt-10 flex gap-6">

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