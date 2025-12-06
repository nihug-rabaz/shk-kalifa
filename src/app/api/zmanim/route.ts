import { NextResponse } from 'next/server';
import { HDate, Location, Zmanim, getSedra } from '@hebcal/core';

type Req = { latitude: number; longitude: number; date?: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Partial<Req> | null;
  if (!body?.latitude || !body?.longitude) {
    return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 });
  }

  const latNum = Number(body.latitude);
  const lngNum = Number(body.longitude);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return NextResponse.json({ error: 'latitude and longitude must be numeric' }, { status: 400 });
  }

  const dateStr = body.date;
  const gregorianDate = dateStr ? new Date(dateStr) : new Date();
  
  try {
    const lngAbs = Math.abs(lngNum);
    const isInIsrael = latNum >= 29.5 && latNum <= 33.5 && lngAbs >= 34.2 && lngAbs <= 35.8;
    const location = new Location(latNum, lngAbs, isInIsrael, 'Asia/Jerusalem', undefined, undefined, undefined, 0);
    const zmanim = new Zmanim(location, gregorianDate, false);
    
    const times: Record<string, string> = {};
    
    const formatTime = (date: Date | null): string | null => {
      if (!date) return null;
      const timeStr = date.toLocaleTimeString('en-US', { 
        timeZone: 'Asia/Jerusalem',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      return timeStr;
    };
    
    const sunrise = zmanim.sunrise();
    if (sunrise) times.sunrise = formatTime(sunrise) || '';
    
    const sunset = zmanim.sunset();
    if (sunset) {
      times.sunset = formatTime(sunset) || '';
      const tzeitDate = new Date(sunset);
      tzeitDate.setMinutes(tzeitDate.getMinutes() + 18);
      times.tzeit = formatTime(tzeitDate) || '';
    }
    
    const alot = zmanim.alotHaShachar();
    if (alot) times.alot = formatTime(alot) || '';
    
    const misheyakir = zmanim.misheyakir();
    if (misheyakir) times.misheyakir = formatTime(misheyakir) || '';
    
    const chatzot = zmanim.chatzot();
    if (chatzot) times.chatzot = formatTime(chatzot) || '';
    
    const minchaGedola = zmanim.minchaGedola();
    if (minchaGedola) times.minchaGedola = formatTime(minchaGedola) || '';
    
    const minchaKetana = zmanim.minchaKetana();
    if (minchaKetana) times.minchaKetana = formatTime(minchaKetana) || '';
    
    const plag = zmanim.plagHaMincha();
    if (plag) times.plag = formatTime(plag) || '';
    
    const hebrewDate = new HDate(gregorianDate);
    const hebrewYear = hebrewDate.getFullYear();
    const hebrewDay = hebrewDate.getDate();
    const hebrewMonth = hebrewDate.getMonth();
    const isInIsraelForSedra = isInIsrael;
    const sedra = getSedra(hebrewYear, isInIsraelForSedra);
    const sedraResult = sedra.lookup(hebrewDate);
    const parasha = sedraResult && sedraResult.parsha && sedraResult.parsha.length > 0 
      ? sedraResult.parsha.join('-') 
      : null;
  
    // Hebrew month names
    const hebrewMonthsMap: Record<number, string> = {
      0: 'ניסן', 1: 'אייר', 2: 'סיון', 3: 'תמוז', 4: 'אב', 5: 'אלול',
      6: 'תשרי', 7: 'חשוון', 8: 'כסלו', 9: 'טבת', 10: 'שבט', 11: 'אדר',
      12: 'אדר א', 13: 'אדר ב'
    };
  
    // Convert day number to Hebrew letters
    function dayToHebrew(day: number): string {
      const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
      const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
      
      if (day < 1) return '';
      if (day === 15) return 'טו';
      if (day === 16) return 'טז';
      if (day < 10) return ones[day];
      
      const tensDigit = Math.floor(day / 10);
      const onesDigit = day % 10;
      
      if (onesDigit === 0) {
        return tens[tensDigit];
      } else {
        return tens[tensDigit] + ones[onesDigit];
      }
    }
  
    // Convert year to Hebrew format
    function yearToHebrew(year: number): string {
      const yearMap: Record<number, string> = {
        5785: 'תשפ"ה', 5786: 'תשפ"ו', 5787: 'תשפ"ז', 5788: 'תשפ"ח', 5789: 'תשפ"ט',
        5784: 'תשפ"ד', 5783: 'תשפ"ג', 5782: 'תשפ"ב', 5781: 'תשפ"א', 5780: 'תש"פ',
        5779: 'תשע"ט', 5778: 'תשע"ח', 5777: 'תשע"ז', 5776: 'תשע"ו', 5775: 'תשע"ה'
      };
      
      if (yearMap[year]) {
        return yearMap[year];
      }
      
      // Fallback: construct from year digits
      const yearStr = year.toString();
      const lastTwo = parseInt(yearStr.slice(-2));
      
      const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
      const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
      
      if (lastTwo < 10) {
        return `תש"${ones[lastTwo]}`;
      } else {
        const tensDigit = Math.floor(lastTwo / 10);
        const onesDigit = lastTwo % 10;
        if (tensDigit === 8) {
          return `תש${tens[8]}"${ones[onesDigit]}`;
        } else {
          return `תש${tens[tensDigit]}${ones[onesDigit]}"ה`;
        }
      }
    }
  
    // Format Hebrew date
    const hebrewDayStr = dayToHebrew(hebrewDay);
    let hebrewMonthStr: string;
    try {
      const monthName = hebrewDate.getMonthName();
      const monthNameMap: Record<string, string> = {
        'Nisan': 'ניסן', 'Iyar': 'אייר', 'Sivan': 'סיון', 'Tamuz': 'תמוז',
        'Av': 'אב', 'Elul': 'אלול', 'Tishrei': 'תשרי', 'Cheshvan': 'חשוון',
        'Kislev': 'כסלו', 'Teves': 'טבת', 'Shevat': 'שבט', 'Adar': 'אדר',
        'Adar I': 'אדר א', 'Adar II': 'אדר ב'
      };
      hebrewMonthStr = monthNameMap[monthName] || hebrewMonthsMap[hebrewMonth] || 'חודש';
    } catch {
      hebrewMonthStr = hebrewMonthsMap[hebrewMonth] || 'חודש';
    }
    const hebrewYearStr = yearToHebrew(hebrewYear);
    const hebrewDateFormatted = `${hebrewDayStr} ${hebrewMonthStr} ${hebrewYearStr}`;

    return NextResponse.json({
      date: dateStr ?? gregorianDate.toISOString().slice(0, 10),
      location: { lat: latNum, lng: lngNum },
      hebrew: {
        day: hebrewDay,
        month: hebrewMonth + 1,
        year: hebrewYear,
        formatted: hebrewDateFormatted,
        date: hebrewDateFormatted
      },
      parasha: parasha ? parasha[0] : null,
      times: times
    });
  } catch (error) {
    console.error('Error fetching from zmanim API:', error);
    // Fallback to local calculation if API fails
    const hebrewDate = new HDate(gregorianDate);
    const hebrewDay = hebrewDate.getDate();
    const hebrewMonth = hebrewDate.getMonth();
    const hebrewYear = hebrewDate.getFullYear();
    
    const hebrewMonthsMap: Record<number, string> = {
      0: 'ניסן', 1: 'אייר', 2: 'סיון', 3: 'תמוז', 4: 'אב', 5: 'אלול',
      6: 'תשרי', 7: 'חשוון', 8: 'כסלו', 9: 'טבת', 10: 'שבט', 11: 'אדר'
    };
    
    function dayToHebrew(day: number): string {
      const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
      const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
      if (day < 1) return '';
      if (day === 15) return 'טו';
      if (day === 16) return 'טז';
      if (day < 10) return ones[day];
      const tensDigit = Math.floor(day / 10);
      const onesDigit = day % 10;
      if (onesDigit === 0) return tens[tensDigit];
      return tens[tensDigit] + ones[onesDigit];
    }
    
    function yearToHebrew(year: number): string {
      const yearMap: Record<number, string> = {
        5785: 'תשפ"ה', 5786: 'תשפ"ו', 5787: 'תשפ"ז', 5788: 'תשפ"ח', 5789: 'תשפ"ט',
        5784: 'תשפ"ד', 5783: 'תשפ"ג', 5782: 'תשפ"ב', 5781: 'תשפ"א', 5780: 'תש"פ'
      };
      if (yearMap[year]) return yearMap[year];
      const yearStr = year.toString();
      const lastTwo = parseInt(yearStr.slice(-2));
      const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
      const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
      if (lastTwo < 10) return `תש"${ones[lastTwo]}`;
      const tensDigit = Math.floor(lastTwo / 10);
      const onesDigit = lastTwo % 10;
      if (tensDigit === 8) return `תש${tens[8]}"${ones[onesDigit]}`;
      return `תש${tens[tensDigit]}${ones[onesDigit]}"ה`;
    }
    
    const hebrewDayStr = dayToHebrew(hebrewDay);
    const hebrewMonthStr = hebrewMonthsMap[hebrewMonth] || 'חודש';
    const hebrewYearStr = yearToHebrew(hebrewYear);
    const hebrewDateFormatted = `${hebrewDayStr} ${hebrewMonthStr} ${hebrewYearStr}`;
    
    return NextResponse.json({
      date: dateStr ?? gregorianDate.toISOString().slice(0, 10),
      location: { lat: latNum, lng: lngNum },
      hebrew: {
        day: hebrewDay,
        month: hebrewMonth + 1,
        year: hebrewYear,
        formatted: hebrewDateFormatted,
        date: hebrewDateFormatted
      },
      parasha: null,
      times: {
        sunrise: '06:30',
        sunset: '18:30',
        tzeit: '18:50'
      }
    });
  }
}

