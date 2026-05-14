# database.py
import sqlite3
from typing import Optional, Dict, Any, List
from datetime import datetime

class VideoSessionDatabase:
    def __init__(self, db_path: str = "video_sessions.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Create the database schema for video sessions."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create video sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS video_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                archive_id TEXT,
                title TEXT,
                description TEXT,
                participant_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                recording_started_at TIMESTAMP,
                recording_ended_at TIMESTAMP,
                duration_seconds INTEGER,
                archive_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create session participants table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS session_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                participant_name TEXT NOT NULL,
                connection_id TEXT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                left_at TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES video_sessions(id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def create_session(self, session_id: str, title: str = None, 
                      description: str = None) -> int:
        """Create a new video session record."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO video_sessions 
            (session_id, title, description, status)
            VALUES (?, ?, ?, 'active')
        ''', (session_id, title, description))
        
        conn.commit()
        session_db_id = cursor.lastrowid
        conn.close()
        
        return session_db_id
    
    def update_session_recording(self, session_id: str, archive_id: str,
                                 recording_started_at: datetime) -> None:
        """Update session with recording details."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE video_sessions 
            SET archive_id = ?, recording_started_at = ?
            WHERE session_id = ?
        ''', (archive_id, recording_started_at, session_id))
        
        conn.commit()
        conn.close()
    
    def end_session(self, session_id: str, archive_url: str = None) -> None:
        """Mark session as ended and store archive URL."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE video_sessions 
            SET status = 'ended', 
                recording_ended_at = CURRENT_TIMESTAMP,
                archive_url = ?
            WHERE session_id = ?
        ''', (archive_url, session_id))
        
        conn.commit()
        conn.close()
    
    def get_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a session by session_id."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM video_sessions WHERE session_id = ?
        ''', (session_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        return dict(row) if row else None
    
    def get_all_recorded_sessions(self) -> List[Dict[str, Any]]:
        """Retrieve all recorded sessions."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM video_sessions 
            WHERE status = 'ended'
            ORDER BY recording_ended_at DESC
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    
    def get_active_sessions(self) -> List[Dict[str, Any]]:
        """Retrieve all active sessions."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM video_sessions 
            WHERE status = 'active'
            ORDER BY created_at DESC
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    
    def add_participant(self, session_id: str, participant_name: str, 
                       connection_id: str = None) -> int:
        """Add a participant to a session."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get the database ID for the session
        cursor.execute('SELECT id FROM video_sessions WHERE session_id = ?', 
                      (session_id,))
        result = cursor.fetchone()
        
        if not result:
            conn.close()
            raise ValueError(f"Session {session_id} not found")
        
        db_session_id = result[0]
        
        cursor.execute('''
            INSERT INTO session_participants 
            (session_id, participant_name, connection_id)
            VALUES (?, ?, ?)
        ''', (db_session_id, participant_name, connection_id))
        
        conn.commit()
        participant_id = cursor.lastrowid
        conn.close()
        
        return participant_id
    
    def get_session_participants(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieve all participants for a session."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT sp.* FROM session_participants sp
            JOIN video_sessions vs ON sp.session_id = vs.id
            WHERE vs.session_id = ?
            ORDER BY sp.joined_at DESC
        ''', (session_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]

# Global database instance
db = VideoSessionDatabase()
