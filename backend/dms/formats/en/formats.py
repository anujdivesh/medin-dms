"""Date/time display for the admin (FORMAT_MODULE_PATH in settings): UTC to
the second, e.g. 2026-07-28T04:06:50Z, and plain dates as midnight UTC - the
same format as the API and pygeoapi. TIME_ZONE is UTC, so the time shown is
UTC. Input formats are Django's defaults (the date pickers stay date-only)."""

DATETIME_FORMAT = r"Y-m-d\TH:i:s\Z"
SHORT_DATETIME_FORMAT = DATETIME_FORMAT
DATE_FORMAT = r"Y-m-d\T00:00:00\Z"
SHORT_DATE_FORMAT = DATE_FORMAT
