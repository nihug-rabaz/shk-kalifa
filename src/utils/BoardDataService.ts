interface BoardData {
  linked: boolean;
  user_id?: string;
  name?: string;
  logical_board_id?: number;
  prayer_times?: {
    shacharit?: string;
    mincha1?: string;
    mincha2?: string;
    maariv?: string;
  };
  updates?: Array<{
    id: number;
    title: string;
    content: string;
    date: string;
  }>;
  halacha?: {
    title: string;
    content: string;
  };
  shuttle_times?: {
    to_base?: string[];
    from_base?: string[];
  };
  [key: string]: any;
}

class BoardDataService {
  static async getBoardData(boardId: string): Promise<BoardData | null> {
    try {
      const response = await fetch(`/api/board-data?board_id=${boardId}`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data;
    } catch (error) {
      return null;
    }
  }

  static async updateBoardData(boardId: string, data: Partial<BoardData>): Promise<boolean> {
    try {
      const response = await fetch('/api/board-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          board_id: boardId,
          ...data
        }),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export default BoardDataService;
export type { BoardData };

