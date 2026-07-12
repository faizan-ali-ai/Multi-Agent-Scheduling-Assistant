import os
from datetime import datetime

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


load_dotenv()


class Database:

    def __init__(self):
        self.connection = psycopg2.connect(
            os.getenv("DATABASE_URL")
        )

        self.connection.autocommit = True

        self.initialize_database()

    def initialize_database(self):

        with self.connection.cursor() as cursor:

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS bookings
                (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    booking_date TEXT NOT NULL,
                    booking_time TEXT NOT NULL,
                    duration INTEGER DEFAULT 30,
                    status TEXT DEFAULT 'CONFIRMED',
                    created_at TIMESTAMP NOT NULL
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversations
                (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL
                )
            """)

    def save_booking(
        self,
        session_id,
        name,
        email,
        purpose,
        booking_date,
        booking_time,
        duration=30,
        status="CONFIRMED"
    ):

        with self.connection.cursor() as cursor:

            cursor.execute("""
                INSERT INTO bookings
                (
                    session_id,
                    name,
                    email,
                    purpose,
                    booking_date,
                    booking_time,
                    duration,
                    status,
                    created_at
                )
                VALUES
                (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                session_id,
                name,
                email,
                purpose,
                booking_date,
                booking_time,
                duration,
                status,
                datetime.utcnow()
            ))

    def is_slot_available(
        self,
        booking_date,
        booking_time
    ):

        with self.connection.cursor() as cursor:

            cursor.execute("""
                SELECT COUNT(*)
                FROM bookings
                WHERE booking_date=%s
                AND booking_time=%s
                AND status='CONFIRMED'
            """, (
                booking_date,
                booking_time
            ))

            count = cursor.fetchone()[0]

        return count == 0

    def save_message(
        self,
        session_id,
        role,
        message
    ):

        with self.connection.cursor() as cursor:

            cursor.execute("""
                INSERT INTO conversations
                (
                    session_id,
                    role,
                    message,
                    created_at
                )
                VALUES
                (%s,%s,%s,%s)
            """, (
                session_id,
                role,
                message,
                datetime.utcnow()
            ))

    def get_conversation_history(
        self,
        session_id,
        limit=20
    ):

        with self.connection.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cursor:

            cursor.execute("""
                SELECT
                    role,
                    message
                FROM conversations
                WHERE session_id=%s
                ORDER BY id DESC
                LIMIT %s
            """, (
                session_id,
                limit
            ))

            rows = cursor.fetchall()

        rows.reverse()

        return rows

    def get_booking(
        self,
        session_id
    ):

        with self.connection.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cursor:

            cursor.execute("""
                SELECT *
                FROM bookings
                WHERE session_id=%s
                ORDER BY id DESC
                LIMIT 1
            """, (
                session_id,
            ))

            row = cursor.fetchone()

        return row

    def close(self):
        self.connection.close()


db = Database()