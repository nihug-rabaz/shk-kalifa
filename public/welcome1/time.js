class HebrewDateConverter {
  convertToHebrewDate(date) {
    try {
      const dayFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric' });
      const monthFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' });
      const yearFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { year: 'numeric' });
      
      const dayParts = dayFormatter.formatToParts(date);
      const monthParts = monthFormatter.formatToParts(date);
      const yearParts = yearFormatter.formatToParts(date);
      
      const day = dayParts.find(p => p.type === 'day')?.value || '';
      const month = monthParts.find(p => p.type === 'month')?.value || '';
      const year = yearParts.find(p => p.type === 'year')?.value || '';
      
      if (day && month && year) {
        const dayNum = parseInt(day);
        const dayStr = this.formatHebrewDay(dayNum);
        const yearNum = parseInt(year);
        const yearStr = this.formatHebrewYear(yearNum);
        const cleanYearStr = yearStr.replace(/^ה'?/, '');
        return `${dayStr} ב${month} ה${cleanYearStr}`;
      }
    } catch (e) {
    }
    return this.fallbackConversion(date);
  }

  formatHebrewDay(day) {
    const hebrewNumbers = [
      "", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'",
      "י'", "י\"א", "י\"ב", "י\"ג", "י\"ד", "ט\"ו", "ט\"ז", "י\"ז", "י\"ח", "י\"ט",
      "כ'", "כ\"א", "כ\"ב", "כ\"ג", "כ\"ד", "כ\"ה", "כ\"ו", "כ\"ז", "כ\"ח", "כ\"ט",
      "ל'"
    ];
    return hebrewNumbers[day] || day.toString();
  }

  formatHebrewYear(year) {
    const letters = {
      1: "א", 2: "ב", 3: "ג", 4: "ד", 5: "ה",
      6: "ו", 7: "ז", 8: "ח", 9: "ט", 10: "י",
      20: "כ", 30: "ל", 40: "מ", 50: "נ",
      60: "ס", 70: "ע", 80: "פ", 90: "צ",
      100: "ק", 200: "ר", 300: "ש", 400: "ת"
    };
    
    let result = "";
    const thousands = Math.floor(year / 1000);
    let remainder = year % 1000;
    
    if (thousands > 0) {
      result += letters[thousands] || "";
    }
    
    if (remainder >= 400) {
      result += letters[400];
      remainder -= 400;
    }
    if (remainder >= 300) {
      result += letters[300];
      remainder -= 300;
    }
    if (remainder >= 200) {
      result += letters[200];
      remainder -= 200;
    }
    if (remainder >= 100) {
      result += letters[100];
      remainder -= 100;
    }
    if (remainder >= 90) {
      result += letters[90];
      remainder -= 90;
    }
    if (remainder >= 80) {
      result += letters[80];
      remainder -= 80;
    }
    if (remainder >= 70) {
      result += letters[70];
      remainder -= 70;
    }
    if (remainder >= 60) {
      result += letters[60];
      remainder -= 60;
    }
    if (remainder >= 50) {
      result += letters[50];
      remainder -= 50;
    }
    if (remainder >= 40) {
      result += letters[40];
      remainder -= 40;
    }
    if (remainder >= 30) {
      result += letters[30];
      remainder -= 30;
    }
    if (remainder >= 20) {
      result += letters[20];
      remainder -= 20;
    }
    if (remainder >= 10) {
      result += letters[10];
      remainder -= 10;
    }
    if (remainder > 0) {
      result += letters[remainder];
    }
    
    // הוסף גרשיים לפני האות האחרונה (לדוגמה: תשפ"ו)
    if (result.length >= 2) {
      const lastChar = result.slice(-1);
      const prefix = result.slice(0, -1);
      result = `${prefix}"${lastChar}`;
    }
    
    return result || "תש\"פ";
  }

  fallbackConversion(date) {
    const hebrewMonths = [
      "ניסן", "אייר", "סיוון", "תמוז", "אב", "אלול",
      "תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר"
    ];
    const hebrewNumbers = [
      "", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'",
      "י'", "י\"א", "י\"ב", "י\"ג", "י\"ד", "ט\"ו", "ט\"ז", "י\"ז", "י\"ח", "י\"ט",
      "כ'", "כ\"א", "כ\"ב", "כ\"ג", "כ\"ד", "כ\"ה", "כ\"ו", "כ\"ז", "כ\"ח", "כ\"ט",
      "ל'"
    ];
    
    const gregorianDate = new Date(date);
    const day = gregorianDate.getDate();
    const month = gregorianDate.getMonth();
    const year = gregorianDate.getFullYear();
    
    const hebrewYear = year + 3760;
    const hebrewDay = hebrewNumbers[day] || day.toString();
    const hebrewMonth = hebrewMonths[month] || "ניסן";
    
    const yearStr = this.formatHebrewYear(hebrewYear);
    const cleanYearStr = yearStr.replace(/^ה'?/, '');
    return `${hebrewDay} ב${hebrewMonth} ה${cleanYearStr}`;
  }
}

class TimeUpdater {
  constructor() {
    this.converter = new HebrewDateConverter();
    this.timeElement = document.getElementById("current-time");
    this.updateInterval = null;
  }

  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  formatDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  updateTime() {
    if (!this.timeElement) {
      return;
    }
    const now = new Date();
    const hebrewDate = this.converter.convertToHebrewDate(now);
    const gregorianDate = this.formatDate(now);
    const time = this.formatTime(now);
    
    const dateTimeString = `${hebrewDate} - ${gregorianDate} ${time}`;
    this.timeElement.textContent = dateTimeString;
    this.timeElement.setAttribute("datetime", now.toISOString());
  }

  start() {
    this.updateTime();
    this.updateInterval = setInterval(() => this.updateTime(), 1000);
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

function initializeTimeUpdater() {
  const timeElement = document.getElementById("current-time");
  if (!timeElement) {
    if (document.readyState === 'loading') {
      document.addEventListener("DOMContentLoaded", initializeTimeUpdater);
    } else {
      setTimeout(initializeTimeUpdater, 100);
    }
    return;
  }
  
  const timeUpdater = new TimeUpdater();
  timeUpdater.start();
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initializeTimeUpdater);
} else {
  initializeTimeUpdater();
}

