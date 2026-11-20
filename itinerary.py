"""Read-only festival planning; no inventory mutations or reservations."""
from datetime import datetime, timedelta, timezone
MANILA=timezone(timedelta(hours=8))

def plan_days(events):
    ordered=sorted(events,key=lambda event:(event['start_at'],event['id']))
    days={}
    for event in ordered:
        day=datetime.fromtimestamp(event['start_at'],MANILA).strftime('%A, %d %B %Y')
        days.setdefault(day,[]).append(event)
    issues=[]
    for i,left in enumerate(ordered):
        for right in ordered[i+1:]:
            gap=right['start_at']-left['end_at']
            if gap<0:
                issues.append({'kind':'overlap','first':left,'second':right,'minutes':max(1,(min(left['end_at'],right['end_at'])-right['start_at']+59)//60)})
            else:
                buffer=15 if left['venue_id']==right['venue_id'] else 30
                if gap<buffer*60:
                    issues.append({'kind':'break','first':left,'second':right,'minutes':gap//60,'suggested':buffer})
    return {'days':days,'issues':issues,'total':sum(event['starting_price'] for event in ordered),'count':len(ordered)}
