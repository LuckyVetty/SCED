// ES Module imports
import { glob } from 'glob';
import { promises as fsPromises } from 'fs'; // 비동기 파일 작업용
import fsStandard from 'fs';              // 스트림 생성용
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises'; // 스트림 파이프라인용

// --- Configuration ---
// const globPattern = '/objects/AllPlayerCards.15bb07/**/*.json';
// Example relative path:
const globPattern = './objects/AllPlayerCards.15bb07/**/*.json';
const errorLogFile = 'download_errors.log'; // 오류 로그 파일 이름

// --- Main Function ---
async function processJsonFiles() {
    console.log(`파일 검색 시작: ${globPattern}`);
    const failedFiles = []; // 실패한 파일 경로를 저장할 배열

    try {
        const jsonFiles = await glob(globPattern, { absolute: true });

        if (jsonFiles.length === 0) {
            console.warn('경고: 일치하는 JSON 파일을 찾을 수 없습니다. 경로를 확인하세요.');
            return;
        }

        console.log(`${jsonFiles.length}개의 JSON 파일을 찾았습니다.`);

        // Process each file sequentially
        for (const jsonPath of jsonFiles) {
            console.log(`\n처리 중: ${jsonPath}`);

            try {
                // 1. Read JSON file content
                const fileContent = await fsPromises.readFile(jsonPath, 'utf-8');

                // 2. Parse JSON data
                const data = JSON.parse(fileContent);

                // 3. Extract the FaceURL
                if (!data.CustomDeck || typeof data.CustomDeck !== 'object') {
                    console.warn(`  경고: ${path.basename(jsonPath)} 파일에 'CustomDeck' 객체가 없습니다. 건너<0xEB>9B<0xEB><0x8B><0x88>다.`);
                    // 실패 목록에는 추가하지 않음 (데이터 구조 문제)
                    continue;
                }
                const deckKeys = Object.keys(data.CustomDeck);
                if (deckKeys.length === 0) {
                    console.warn(`  경고: ${path.basename(jsonPath)} 파일의 'CustomDeck'이 비어있습니다. 건너<0xEB>9B<0xEB><0x8B><0x88>다.`);
                    // 실패 목록에는 추가하지 않음 (데이터 구조 문제)
                    continue;
                }
                const firstDeckKey = deckKeys[0];
                const deckData = data.CustomDeck[firstDeckKey];
                if (!deckData || !deckData.FaceURL) {
                    console.warn(`  경고: ${path.basename(jsonPath)} 파일의 CustomDeck['${firstDeckKey}']에서 'FaceURL'을 찾을 수 없습니다. 건너<0xEB>9B<0xEB><0x8B><0x88>다.`);
                    // 실패 목록에는 추가하지 않음 (데이터 구조 문제)
                    continue;
                }
                const imageUrl = deckData.FaceURL;
                console.log(`  FaceURL 발견: ${imageUrl}`);

                // 4. Determine the output path for the image
                const dirName = path.dirname(jsonPath);
                const baseName = path.basename(jsonPath, '.json');
                const imageOutputPath = path.join(dirName, `${baseName}.jpg`);
                console.log(`  이미지 저장 경로: ${imageOutputPath}`);

                // 5. Download the image using axios (as a stream)
                console.log(`  이미지 다운로드 중...`);
                const response = await axios({
                    method: 'GET',
                    url: imageUrl,
                    responseType: 'stream',
                });

                // 6. Save the image stream to the file using pipeline
                const writer = fsStandard.createWriteStream(imageOutputPath);
                await pipeline(response.data, writer); // Pipe download to file

                console.log(`  성공: 이미지가 ${imageOutputPath}에 저장되었습니다.`);

            } catch (error) {
                // 오류 발생 시 콘솔에 로그 남기고, 실패 목록에 추가
                console.error(`  오류 발생 (${path.basename(jsonPath)}): ${error.message}`);
                if (axios.isAxiosError(error)) {
                    console.error(`    다운로드 실패 상태: ${error.response?.status}, URL: ${error.config?.url}`);
                } else if (error instanceof SyntaxError) {
                    console.error("    JSON 파싱 오류: 파일 형식이 올바르지 않을 수 있습니다.");
                }
                // 실패한 파일 경로를 배열에 추가
                failedFiles.push(jsonPath);
            }
        } // --- End of for loop ---

        console.log('\n모든 파일 처리가 완료되었습니다.');

        // --- Write Error Log File ---
        if (failedFiles.length > 0) {
            console.log(`\n총 ${failedFiles.length}개의 파일 처리 중 오류가 발생했습니다. 로그 파일 생성 중...`);
            // 로그 파일 내용 생성 (실패한 파일 경로 목록)
            const logHeader = `이미지 다운로드 실패 목록 (${new Date().toLocaleString('ko-KR')}):\n=============================================\n`;
            const logContent = logHeader + failedFiles.join('\n') + '\n'; // 각 경로를 새 줄로 구분

            try {
                // 로그 파일 작성 (비동기)
                await fsPromises.writeFile(errorLogFile, logContent, 'utf-8');
                console.log(`오류 로그가 ${errorLogFile} 파일에 저장되었습니다.`);
            } catch (writeError) {
                // 로그 파일 작성 중 오류 발생 시
                console.error(`오류 로그 파일 (${errorLogFile}) 작성 실패: ${writeError.message}`);
            }
        } else {
            // 실패한 파일이 없을 경우
            console.log("\n모든 파일이 성공적으로 처리되었습니다. 오류 없음.");
        }

    } catch (err) {
        // 스크립트 실행 시작 시 (예: glob 오류) 심각한 오류 처리
        console.error('스크립트 실행 중 심각한 오류 발생:', err);
         // 심각한 오류도 로그 파일에 기록 시도
        try {
            const criticalErrorContent = `스크립트 초기 실행 오류 (${new Date().toLocaleString('ko-KR')}):\n=============================================\n${err.message}\n${err.stack || ''}\n`;
            await fsPromises.writeFile(errorLogFile, criticalErrorContent, 'utf-8');
            console.log(`심각한 오류 정보가 ${errorLogFile} 파일에 저장되었습니다.`);
        } catch (logWriteError) {
            console.error("심각한 오류 발생 시 로그 파일 작성에도 실패했습니다:", logWriteError);
        }
    }
}

// --- Run the script ---
processJsonFiles();