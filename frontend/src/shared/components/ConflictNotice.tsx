import { Button } from "./Button";
import { StateNotice } from "./StateNotice";

type Props = {
  /** 서버의 최신 내용으로 다시 불러온다. 현재 입력은 사라진다. */
  onReload: () => void;
  /** 내 변경을 유지하고 계속 편집한다. 저장하려면 최신 내용을 확인해야 한다. */
  onKeepEditing: () => void;
};

/** 동시 수정 충돌(412/EDIT_CONFLICT) 안내. 어느 쪽도 자동으로 덮어쓰지 않는다. */
export function ConflictNotice({ onReload, onKeepEditing }: Props) {
  return (
    <StateNotice
      kind="conflict"
      action={
        <>
          <Button onClick={onReload}>최신 내용으로 다시 불러오기</Button>
          <Button onClick={onKeepEditing}>내 변경을 유지하고 계속 편집</Button>
        </>
      }
    >
      자동으로 덮어쓰지 않았습니다. 최신 내용을 불러오면 이 화면의 변경은 사라집니다.
    </StateNotice>
  );
}
