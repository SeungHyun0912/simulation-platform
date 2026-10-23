import { Button } from "./Button";
import { StateNotice } from "./StateNotice";

type Props = {
  /** 충돌이 난 리소스 이름(예: "자산 기본 정보", "용량 버전"). 한쪽 충돌이 다른 쪽 입력을 지우지 않음을 알린다. */
  resource?: string;
  /** 서버의 최신 내용으로 다시 불러온다. 이 리소스의 현재 입력은 사라진다. */
  onReload: () => void;
  /** 내 변경을 유지하고 계속 편집한다. 저장하려면 최신 내용을 확인해야 한다. */
  onKeepEditing: () => void;
};

/** 동시 수정 충돌(412/EDIT_CONFLICT) 안내. 어느 쪽도 자동으로 덮어쓰지 않는다. */
export function ConflictNotice({ resource, onReload, onKeepEditing }: Props) {
  return (
    <StateNotice
      kind="conflict"
      title={resource ? `${resource}: 다른 사용자가 먼저 수정했습니다` : undefined}
      action={
        <>
          <Button onClick={onReload}>최신 내용으로 다시 불러오기</Button>
          <Button onClick={onKeepEditing}>내 변경을 유지하고 계속 편집</Button>
        </>
      }
    >
      자동으로 덮어쓰지 않았습니다. 최신 내용을 불러오면 {resource ? `${resource}의 ` : "이 화면의 "}
      변경은 사라집니다.{resource && " 다른 영역의 입력은 그대로 유지됩니다."}
    </StateNotice>
  );
}
