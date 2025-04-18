import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { globSync } from 'glob'; // glob v10+ 권장 (이전 버전은 import 방식이 다를 수 있음)

const csvFilePath = './img_index.csv'; // 스크립트 실행 위치 기준 상대 경로
const jsonSearchPattern = './objects/AllPlayerCards.15bb07/**/*.json';

try {
    // 1. CSV 파일 읽기 및 파싱
    const absoluteCsvPath = path.resolve(csvFilePath); // 상대 경로를 절대 경로로 변환
    if (!fs.existsSync(absoluteCsvPath)) {
        throw new Error(`CSV file not found: ${absoluteCsvPath}`);
    }
    const csvContent = fs.readFileSync(absoluteCsvPath, 'utf8');
    const records = parse(csvContent, {
        columns: false,
        skip_empty_lines: true,
        from_line: 2, // 헤더 행 건너뛰기
        trim: true,
    });

    // 2. 이미지 이름과 URL을 Map으로 저장 (빠른 검색용)
    const imageMap = new Map();
    records.forEach(([url, name]) => {
        if (url && name) {
            imageMap.set(name, url);
        }
    });

    console.log(`Loaded ${imageMap.size} image mappings from ${absoluteCsvPath}`);

    // 3. 대상 JSON 파일 검색
    // globSync는 패턴에 절대 경로가 있으면 절대 경로로, 상대 경로가 있으면 process.cwd() 기준 상대 경로로 검색합니다.
    // 절대 경로 패턴(/objects/...)을 그대로 사용하거나, 위에서 주석 처리된 상대 경로 패턴 중 하나를 선택합니다.
    const jsonFiles = globSync(jsonSearchPattern, { absolute: true }); // 항상 절대 경로로 결과를 받도록 설정

    console.log(`Found ${jsonFiles.length} JSON files matching the pattern.`);

    let updatedCount = 0;
    let skippedNoMatch = 0;
    let skippedNoCustomDeck = 0;
    let errorCount = 0;

    // 4. 각 JSON 파일 처리
    jsonFiles.forEach(filePath => {
        const baseName = path.basename(filePath, '.json'); // 확장자 제외 파일명 추출

        if (imageMap.has(baseName)) {
            const imageUrl = imageMap.get(baseName);
            try {
                const jsonContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(jsonContent);

                if (data && data.CustomDeck) {
                    let fileNeedsUpdate = false;
                    Object.keys(data.CustomDeck).forEach(deckId => {
                        if (data.CustomDeck[deckId]) {
                            // FaceURL 업데이트
                            data.CustomDeck[deckId].FaceURL = imageUrl;
                            fileNeedsUpdate = true;
                        }
                    });

                    if (fileNeedsUpdate) {
                        // 변경된 내용으로 JSON 파일 덮어쓰기 (pretty print)
                        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                        // console.log(`Updated: ${filePath}`); // 개별 파일 업데이트 로그 (선택 사항)
                        updatedCount++;
                    } else {
                         // CustomDeck은 있지만 하위 덱 ID가 없는 경우 (거의 발생하지 않음)
                         skippedNoCustomDeck++;
                    }
                } else {
                    // console.log(`Skipped (CustomDeck not found): ${filePath}`); // 스킵 로그 (선택 사항)
                    skippedNoCustomDeck++;
                }
            } catch (err) {
                // err이 Error 객체인지 확인하고 메시지 출력
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.error(`Error processing file ${filePath}:`, errorMessage);
                errorCount++;
            }
        } else {
            // console.log(`Skipped (No match in CSV for ${baseName}): ${filePath}`); // 스킵 로그 (선택 사항)
            skippedNoMatch++;
        }
    });

    console.log("\n--- Processing Summary ---");
    console.log(`Total JSON files found: ${jsonFiles.length}`);
    console.log(`Files successfully updated: ${updatedCount}`);
    console.log(`Files skipped (No match in CSV): ${skippedNoMatch}`);
    console.log(`Files skipped (CustomDeck missing or empty): ${skippedNoCustomDeck}`);
    console.log(`Files failed due to errors: ${errorCount}`);
    console.log("--------------------------");

} catch (error) {
    console.error("\nScript execution failed:");
    // error가 Error 객체인지 확인하고 메시지/스택 출력
    if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack); // 스택 트레이스 추가
    } else {
        console.error(String(error));
    }
    process.exit(1); // 오류 발생 시 비정상 종료 코드 반환
}
