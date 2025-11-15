import { NextResponse } from 'next/server';
import { HDate } from '@hebcal/core';

type Req = { latitude: number; longitude: number; date?: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Partial<Req> | null;
  if (!body?.latitude || !body?.longitude) {
    return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 });
  }

  const dateStr = body.date;
  const gregorianDate = dateStr ? new Date(dateStr) : new Date();
  
  // Call external zmanim API via server-side proxy with explicit headers
  try {
    const incomingUA = (req.headers as any).get?.('user-agent') || 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
    const payload = {
      latitude: body.latitude,
      longitude: body.longitude,
      date: dateStr || gregorianDate.toISOString().slice(0, 10)
    };

    const zmanimResponse = await fetch('https://zmanim-web.vercel.app/api/zmanim', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'accept-language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
        'origin': 'https://zmanim-web.vercel.app',
        'referer': 'https://zmanim-web.vercel.app/',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': incomingUA
      },
      body: JSON.stringify(payload)
    });

    if (!zmanimResponse.ok) {
      throw new Error('Failed to fetch from zmanim API');
    }

    const zmanimData = await zmanimResponse.json();
    
    // Extract data from zmanim API response
    const hebrewDateFromAPI = zmanimData.hebrewDate || zmanimData.hebrew?.date || zmanimData.hebrewDateString;
    const parasha = zmanimData.parasha || zmanimData.parashaName || zmanimData.parsha || zmanimData.torahPortion;
    const times = zmanimData.times || zmanimData.zmanim || zmanimData || {};
    
    // Log for debugging
    console.log('Zmanim API response:', JSON.stringify(zmanimData, null, 2));
    
    // Calculate Hebrew date locally for display format
    const hebrewDate = new HDate(gregorianDate);
    const hebrewDay = hebrewDate.getDate();
    const hebrewMonth = hebrewDate.getMonth();
    const hebrewYear = hebrewDate.getFullYear();
  
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
      location: { lat: body.latitude, lng: body.longitude },
      hebrew: {
        day: hebrewDay,
        month: hebrewMonth + 1,
        year: hebrewYear,
        formatted: hebrewDateFormatted,
        date: hebrewDateFormatted,
        original: hebrewDateFromAPI
      },
      parasha: parasha,
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
      location: { lat: body.latitude, lng: body.longitude },
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

