"""Optional heraldry, with a bounded browser profile and immutable ticket snapshots."""
import unicodedata

CRESTS = {'stag':'Stag', 'raven':'Raven', 'sun':'Sun', 'tower':'Tower'}
PALETTES = {'crimson':'Crimson & gold', 'emerald':'Emerald & gold', 'sapphire':'Sapphire & silver', 'plum':'Plum & ivory'}
HOUSE_SCHEMA = '''CREATE TABLE IF NOT EXISTS booking_houses (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 profile TEXT NOT NULL
)'''

def validate_house(data):
    if not isinstance(data, dict):
        raise ValueError('Enter a valid house profile.')
    result = {}
    for key, maximum, minimum in [('name',40,2),('motto',80,0)]:
        value=data.get(key,'')
        if not isinstance(value,str):
            raise ValueError('House name and motto must be text.')
        if any(unicodedata.category(c).startswith('C') for c in value):
            raise ValueError('House text cannot contain control characters.')
        value=value.strip()
        if not minimum <= len(value) <= maximum or any(unicodedata.category(c).startswith('C') for c in value):
            raise ValueError(f'House {key} must contain {minimum}–{maximum} characters without control characters.')
        result[key]=value
    for key,choices in [('crest',CRESTS),('palette',PALETTES)]:
        if not isinstance(data.get(key),str) or data[key] not in choices:
            raise ValueError(f'Choose one of the available {key} options.')
        result[key]=data[key]
    return result
