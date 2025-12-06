# הוראות התקנה - מצב קיוסק אוטומטי

מדריך זה מסביר כיצד להגדיר את shk-kalifa לפעול כקיוסק אוטומטי במחשב Windows 10.

## דרישות מוקדמות

- Windows 10 או חדש יותר
- Node.js 18+ מותקן
- Git מותקן
- Google Chrome מותקן
- הרשאות מנהל (Administrator) להגדרה ראשונית

## התקנה מהירה

1. פתח PowerShell כמנהל (Run as Administrator)
2. נווט לתיקיית הפרויקט
3. הרץ את הסקריפט הראשי:

```powershell
.\kiosk-setup\setup-kiosk.ps1
```

הסקריפט יבצע:
- התקנת PM2 (אם לא מותקן)
- בניית האפליקציה
- הפעלת האפליקציה
- יצירת Tasks ב-Task Scheduler
- הגדרת הפעלה אוטומטית

## מה קורה אחרי ההתקנה?

### הפעלה אוטומטית עם Windows

כשהמחשב נדלק:
1. **10 שניות אחרי התחברות** - האפליקציה מתחילה אוטומטית עם PM2
2. **20 שניות אחרי התחברות** - Chrome נפתח במסך מלא בקיוסק על `http://localhost:3000`

### עדכון אוטומטי ב-USB

בכל פעם שמחברים USB כלשהו:
1. המערכת מזהה את החיבור
2. עוצרת את האפליקציה
3. מושכת עדכונים מה-Git (`git fetch` + `git pull`)
4. מתקינה תלויות חדשות (אם יש שינויים)
5. בונה מחדש את האפליקציה
6. מפעילה מחדש את האפליקציה
7. מרעננת את Chrome

## קבצים וסקריפטים

### `kiosk-setup/install-pm2.ps1`
מתקין PM2 גלובלית אם לא מותקן.

**שימוש:**
```powershell
.\kiosk-setup\install-pm2.ps1
```

### `kiosk-setup/start-app.ps1`
מפעיל את האפליקציה עם PM2.

**שימוש:**
```powershell
.\kiosk-setup\start-app.ps1
```

הסקריפט:
- בודק אם האפליקציה כבר רצה
- בונה את האפליקציה אם צריך
- מפעיל עם PM2
- מחכה שהשרת יהיה זמין

### `kiosk-setup/start-chrome.ps1`
פותח Chrome במסך מלא בקיוסק.

**שימוש:**
```powershell
.\kiosk-setup\start-chrome.ps1
```

הסקריפט:
- מחכה שהאפליקציה תהיה זמינה
- סוגר Chrome קיים (אם יש)
- פותח Chrome במסך מלא על `http://localhost:3000`

### `kiosk-setup/update-on-usb.ps1`
מבצע עדכון אוטומטי כשמחברים USB.

**שימוש:**
```powershell
.\kiosk-setup\update-on-usb.ps1
```

הסקריפט:
- עוצר את PM2
- מושך עדכונים מה-Git
- מתקין תלויות (אם צריך)
- בונה מחדש
- מפעיל מחדש את PM2
- מרענן את Chrome

### `kiosk-setup/setup-kiosk.ps1`
סקריפט התקנה ראשונית - מגדיר הכל.

**שימוש:**
```powershell
.\kiosk-setup\setup-kiosk.ps1
```

אופציות:
- `-SkipPM2Install` - דילוג על התקנת PM2

## ניהול PM2

### צפייה בסטטוס
```powershell
pm2 list
pm2 logs shk-kalifa
```

### עצירה/הפעלה מחדש
```powershell
pm2 stop shk-kalifa
pm2 restart shk-kalifa
pm2 delete shk-kalifa
```

### שמירת הגדרות
```powershell
pm2 save
```

## Task Scheduler

ההתקנה יוצרת 3 Tasks ב-Task Scheduler:

1. **shk-kalifa-start-app** - מפעיל את האפליקציה בהתחברות
2. **shk-kalifa-start-chrome** - מפעיל Chrome 10 שניות אחרי התחברות
3. **shk-kalifa-usb-update** - מאזין לחיבור USB

### צפייה ב-Tasks
1. פתח Task Scheduler (`taskschd.msc`)
2. חפש Tasks שמתחילים ב-`shk-kalifa`

### מחיקת Tasks
```powershell
Unregister-ScheduledTask -TaskName "shk-kalifa-start-app" -Confirm:$false
Unregister-ScheduledTask -TaskName "shk-kalifa-start-chrome" -Confirm:$false
Unregister-ScheduledTask -TaskName "shk-kalifa-usb-listener" -Confirm:$false
Unregister-ScheduledTask -TaskName "shk-kalifa-usb-update" -Confirm:$false
```

## פתרון בעיות

### האפליקציה לא מתחילה
1. בדוק ש-Node.js מותקן: `node --version`
2. בדוק ש-PM2 מותקן: `pm2 --version`
3. בדוק את ה-logs: `pm2 logs shk-kalifa`
4. נסה להפעיל ידנית: `.\kiosk-setup\start-app.ps1`

### Chrome לא נפתח
1. בדוק שהאפליקציה רצה: `pm2 list`
2. בדוק שהשרת זמין: פתח `http://localhost:3000` בדפדפן
3. נסה להפעיל ידנית: `.\kiosk-setup\start-chrome.ps1`

### עדכון לא עובד ב-USB
1. בדוק שה-USB מזוהה: פתח Device Manager
2. נסה להפעיל ידנית: `.\kiosk-setup\update-on-usb.ps1`
3. בדוק את ה-log: `kiosk-setup\update-log.txt`

### שגיאות Git
1. בדוק שיש חיבור לאינטרנט
2. בדוק שהפרויקט הוא Git repository: `git status`
3. בדוק שהריפו מוגדר: `git remote -v`

### יציאה ממצב קיוסק
- לחץ `Ctrl+Alt+Delete` כדי לפתוח Task Manager
- או לחץ `Alt+F4` (אם לא נחסם)

## הגדרות נוספות

### שינוי פורט
אם אתה רוצה לשנות את הפורט מ-3000:

1. עדכן את `ecosystem.config.js`:
```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3001  // שנה כאן
}
```

2. עדכן את `start-chrome.ps1`:
```powershell
$url = "http://localhost:3001"  // שנה כאן
```

### שינוי זמן המתנה
אם אתה רוצה לשנות את זמן ההמתנה לפני פתיחת Chrome:

עדכן את `setup-kiosk.ps1`:
```powershell
$trigger2.Delay = "PT20S"  # שנה ל-20 שניות
```

## תמיכה

לבעיות או שאלות, בדוק את:
- Logs של PM2: `pm2 logs shk-kalifa`
- Logs של עדכונים: `kiosk-setup\update-log.txt`
- Task Scheduler logs

---

**מערכת תצוגה דינמית - מפקדת הרבנות הצבאית**

