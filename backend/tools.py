from database import db


def check_availability(booking_date, booking_time):
    return db.is_slot_available(
        booking_date,
        booking_time
    )


def reserve_slot(
    session_id,
    name,
    email,
    purpose,
    booking_date,
    booking_time,
    duration=30
):
    available = check_availability(
        booking_date,
        booking_time
    )

    if not available:
        return {
            "success": False,
            "message": "Selected slot is already booked."
        }

    db.save_booking(
        session_id=session_id,
        name=name,
        email=email,
        purpose=purpose,
        booking_date=booking_date,
        booking_time=booking_time,
        duration=duration,
        status="CONFIRMED"
    )

    booking = db.get_booking(session_id)

    return {
        "success": True,
        "message": "Booking confirmed.",
        "booking": booking
    }


def send_booking_notification(
    name,
    email,
    purpose,
    booking_date,
    booking_time,
    duration=30
):
    return {
        "success": True,
        "notification": {
            "recipient": email,
            "subject": "Appointment Confirmation",
            "message": (
                f"Hello {name}, "
                f"your appointment for '{purpose}' "
                f"has been confirmed on "
                f"{booking_date} at {booking_time}. "
                f"Duration: {duration} minutes."
            )
        }
    }