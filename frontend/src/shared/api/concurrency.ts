/**
 * 동시에 실행할 비동기 작업 수를 제한한다. 여러 제품의 공정 그래프를 한꺼번에 읽을 때 서버에 요청이 몰리지 않게
 * 한 번에 `max`개만 보낸다(Backend 권장 6~8, 2026-10-27). 취소된 작업도 자리를 돌려준다.
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const run = waiting.shift();
    if (run) {
      active++;
      run();
    }
  };
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
