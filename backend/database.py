import sqlite3
from pathlib import Path
from datetime import datetime


class Database:
    def __init__(self, db_name="scheduler.db"):
        self.db_path = Path(db_name)
        self.connection = sqlite3.connect(
            self.db_path,
            check_same_thread=False
        )
        self.connection.row_factory = sqlite3.Row
        self.cursor = self.connection.cursor()
        self.initialize_database()

    def initialize_database(self):
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                purpose TEXT NOT NULL,
                booking_date TEXT NOT NULL,
                booking_time TEXT NOT NULL,
                duration INTEGER NOT NULL DEFAULT 30,
                status TEXT DEFAULT 'CONFIRMED',
                created_at TEXT NOT NULL
            )
        """)

        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        self.connection.commit()
        self.run_migrations()

    def run_migrations(self):
        self.cursor.execute("""
            PRAGMA table_info(bookings)
        """)

        columns = {
            row["name"]
            for row in self.cursor.fetchall()
        }

        if "duration" not in columns:
            self.cursor.execute("""
                ALTER TABLE bookings
                ADD COLUMN duration INTEGER NOT NULL DEFAULT 30
            """)

        self.connection.commit()

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
        self.cursor.execute("""
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id,
            name,
            email,
            purpose,
            booking_date,
            booking_time,
            duration,
            status,
            datetime.now().isoformat()
        ))

        self.connection.commit()

    def is_slot_available(
        self,
        booking_date,
        booking_time
    ):
        self.cursor.execute("""
            SELECT COUNT(*)
            FROM bookings
            WHERE booking_date = ?
            AND booking_time = ?
            AND status = 'CONFIRMED'
        """, (
            booking_date,
            booking_time
        ))

        count = self.cursor.fetchone()[0]

        return count == 0

    def save_message(
        self,
        session_id,
        role,
        message
    ):
        self.cursor.execute("""
            INSERT INTO conversations
            (
                session_id,
                role,
                message,
                created_at
            )
            VALUES (?, ?, ?, ?)
        """, (
            session_id,
            role,
            message,
            datetime.now().isoformat()
        ))

        self.connection.commit()

    def get_conversation_history(
        self,
        session_id,
        limit=20
    ):
        self.cursor.execute("""
            SELECT role, message
            FROM conversations
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
        """, (
            session_id,
            limit
        ))

        rows = self.cursor.fetchall()

        rows.reverse()

        return [
            {
                "role": row["role"],
                "message": row["message"]
            }
            for row in rows
        ]

    def get_booking(
        self,
        session_id
    ):
        self.cursor.execute("""
            SELECT *
            FROM bookings
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT 1
        """, (
            session_id,
        ))

        row = self.cursor.fetchone()

        if row is None:
            return None

        return dict(row)
    
    

    def close(self):
        self.connection.close()


db = Database()