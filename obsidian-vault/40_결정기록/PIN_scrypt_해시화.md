# PIN_scrypt_해시화

## 상태
✅ 확정

## 한 줄 요약
PIN을 scrypt로 해시화 + 평문 PIN 매칭 시 즉시 해시 PATCH (자동 점진 마이그레이션)

## 결정 내용
"scrypt:saltHex:hashHex" 형식으로 pin_hash 필드 저장. 기존 평문 PIN은 로그인 성공 시 즉시 해시화. backward compatible 우선 원칙으로 한번에 마이그레이션하지 않음.

## 영향받는 모듈
- [[PIN_인증]]

## 영향받는 시나리오
- [[50_시나리오/A6_PIN_로그인_정상_흐름]]
