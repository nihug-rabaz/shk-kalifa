# סיכום שינויים באתר - מפקדת הרבנות הצבאית

## 1. פונטים (Fonts)
- **הוספתי @font-face declarations ב-globals.css:**
  - Fb Liddar-Bold → `fonts/FbLiddar-Bold.otf`
  - Fb Liddar-Regular → `fonts/FbLiddar-Regular.otf`
  - Ploni ML v2 AAA-Bold → `fonts/ploni-bold-aaa.ttf`
  - Ploni ML v2 AAA-Medium → `fonts/ploni-regular-aaa.ttf`
  - Ploni ML v2 AAA-Regular → `fonts/ploni-regular-aaa.ttf`

- **החלפתי את כל ה-Inter fonts ל-Ploni:**
  - כל ה-"Inter-Bold" → "Ploni ML v2 AAA-Bold"
  - כל ה-"Inter-Regular" → "Ploni ML v2 AAA-Regular"

## 2. תאריך ושעה דינמיים
- **יצרתי קובץ `time.js`:**
  - מעדכן את התאריך והשעה כל שנייה
  - מציג תאריך עברי מדויק (כ"ג בחשוון התשפ"ו)
  - משתמש ב-Intl.DateTimeFormat להמרת תאריכים עבריים
  - פורמט: `כ"ג בחשוון התשפ"ו - 14.11.2025 10:13:54`
  - השנה מוצגת כ-"התשפ"ו" (ה' אחת לפני האות הראשונה)

## 3. רספונסיביות
- **יצרתי קובץ `responsive.js`:**
  - מחשב scale אוטומטית לפי גודל המסך
  - מתאים את האתר למסכי טלוויזיה בכל גודל
  - ממרכז את התוכן על המסך
  - מתעדכן אוטומטית ב-resize

- **שינויים ב-globals.css:**
  - רקע: `#bbdfc5` (ירוק בהיר)
  - body עם `position: relative` ו-`overflow: hidden`

- **שינויים ב-style.css:**
  - `.frame` עם `transform-origin: 0 0` ו-`will-change: transform`
  - ה-JavaScript מטפל ב-scaling דינמי

## 4. שינויים בתוכן

### מוקדי תמיכה:
- **הסרתי "תקלות בינוי":**
  - כל הפריט הועבר להערה ב-HTML
  - הערה: "עדיין לא מצאנו את מספר הטלפון של תקלות בינוי"

### פינת הידעת:
- **שיניתי את הטקסט:**
  - מ-"טקסט" ל-"שיעור תנ״ך<br />מתקיים מדי יום רביעי בשעה 11:00 במשרד רמ״ד איתור ומיצוב<br />מוזמנים בשמחה!"
  - מיקום: `top: 1168px, left: 2738px`
  - גודל: `font-size: 50px`
  - צבע: `#1c4080` (כחול)
  - פונט: Ploni ML v2 AAA-Bold

### תמונה hayadat.jpg:
- **הוספתי עיצוב:**
  - `border: 8px solid white`
  - `border-radius: 80px`

## 5. עיצוב ומיקום

### כותרת ראשית:
- **"ברוכים הבאים למפקדת הרבנות הצבאית":**
  - מיקום: `left: 849px` (הוזז 40px ימינה)
  - צבע: לבן (`#ffffff`)

### כותרת כחולה (shadow):
- **text-wrapper-26:**
  - מיקום: `left: 839px` (הוזז 20px ימינה)
  - צבע: כחול (`#2f5388`)

### זמני תפילה:
- **z-index: 99** - מופיע מעל אלמנטים אחרים

### זמני שאטל:
- **letter-spacing: 0** - הסרתי את כל ה-letter-spacing השלילי
- כל השעות עכשיו עם מרווח נורמלי

## 6. קרדיטים (חשוב!)
- **הוספתי קרדיט בתחתית הדף בצד שמאל:**
  - **מיקום ב-HTML:** `<div class="credits">` בתוך `<footer>`
  - **טקסט:** "פותח ע"י ליעד קדוש עוצב ע"י אריה דנה"
  - **מיקום CSS:** `top: 2161px, left: 20px` (באותו גובה של התאריך והשעה)
  - **גודל:** `font-size: 32px`
  - **צבע:** `#1c4080` (כחול)
  - **פונט:** Ploni ML v2 AAA-Bold
  - **מיקום:** צד שמאל למטה, באותו גובה של התאריך

## 7. קבצים שנוצרו/שונו

### קבצים חדשים:
- `time.js` - עדכון תאריך ושעה דינמי
- `responsive.js` - רספונסיביות למסכי טלוויזיה

### קבצים שעודכנו:
- `index.html` - שינויים בתוכן, הוספת scripts
- `globals.css` - הוספת @font-face, שינוי רקע
- `style.css` - כל השינויים בעיצוב ומיקום

## 8. מבנה הפרויקט
```
welcomfirst/
├── fonts/
│   ├── FbLiddar-Bold.otf
│   ├── FbLiddar-Regular.otf
│   ├── ploni-bold-aaa.ttf
│   └── ploni-regular-aaa.ttf
├── img/
│   ├── backgroud.png
│   ├── hayadat.jpg
│   ├── shatel.png
│   ├── tfila.png
│   └── yesiva.png
├── globals.css
├── index.html
├── responsive.js
├── style.css
└── time.js
```

## הערות חשובות ל-Agent השני:
1. האתר בנוי עם מידות קבועות (4000px x 2250px) ומוקטן אוטומטית
2. כל המיקומים הם absolute positioning
3. הפונטים נטענים מהתיקייה `fonts/`
4. התאריך העברי מתעדכן כל שנייה
5. האתר רספונסיבי למסכי טלוויזיה בכל גודל
6. יש z-index: 99 על זמני תפילה
7. כל ה-Inter fonts הוחלפו ל-Ploni
8. **קרדיט בתחתית:** "פותח ע"י ליעד קדוש עוצב ע"י אריה דנה" - מיקום: צד שמאל, באותו גובה של התאריך (top: 2161px, left: 20px)

