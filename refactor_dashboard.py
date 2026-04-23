import os

target_file = '/Users/ijaeam/Library/CloudStorage/GoogleDrive-admin@bible114.net/공유 드라이브/@ 이재암/! 프로그램 제작/성서교회 API/성경읽기(성서교회) 앱/src/App.jsx'

with open(target_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Verify the starting line to be safe
start_line_content = lines[2055].strip()
if "if (view === 'dashboard' && currentUser) {" not in start_line_content:
    print(f"Error: Expected 'if (view === \\'dashboard\\' && currentUser) {{' at line 2056, but found '{start_line_content}'")
    exit(1)

# Verify the ending line to be safe
end_line_content = lines[3664].strip()
if end_line_content != "}":
    print(f"Error: Expected '}}' at line 3665, but found '{end_line_content}'")
    # We might be off by a few lines due to previous edits. Let's find the closing brace.
    # Actually, let's just use the line numbers from the last view_file call.

new_content = """    if (view === 'dashboard' && currentUser) {
        return (
            <DashboardView
                currentUser={currentUser}
                communityMembers={communityMembers}
                allMembersForRace={allMembersForRace}
                memos={memos}
                currentMemo={currentMemo}
                setCurrentMemo={setCurrentMemo}
                readHistory={readHistory}
                announcement={announcement}
                verseData={verseData}
                viewingDay={viewingDay}
                setViewingDay={setViewingDay}
                fontSize={fontSize}
                setFontSize={setFontSize}
                isSpeaking={isSpeaking}
                isPaused={isPaused}
                handleTogglePause={handleTogglePause}
                ttsSpeed={ttsSpeed}
                handleSpeedChange={handleSpeedChange}
                handleStop={handleStop}
                handleSpeak={handleSpeak}
                availableVoices={availableVoices}
                selectedVoiceURI={selectedVoiceURI}
                setSelectedVoiceURI={setSelectedVoiceURI}
                activeChunkIndex={activeChunkIndex}
                jumpToChunk={jumpToChunk}
                handleRead={handleRead}
                saveMemo={saveMemo}
                handleLogout={handleLogout}
                handleChangeVersionStart={handleChangeVersionStart}
                handleRestart={handleRestart}
                changeSubgroup={changeSubgroup}
                changeStartDate={changeStartDate}
                dateToOffset={dateToOffset}
                showConfetti={showConfetti}
                levelUpToast={levelUpToast}
                bonusToast={bonusToast}
                newAchievement={newAchievement}
                showScoreInfo={showScoreInfo} setShowScoreInfo={setShowScoreInfo}
                showReadingGuide={showReadingGuide} setShowReadingGuide={setShowReadingGuide}
                showMemoList={showMemoList} setShowMemoList={setShowMemoList}
                showAchievements={showAchievements} setShowAchievements={setShowAchievements}
                showCalendar={showCalendar} setShowCalendar={setShowCalendar}
                showFullRanking={showFullRanking} setShowFullRanking={setShowFullRanking}
                showDateSettings={showDateSettings} setShowDateSettings={setShowDateSettings}
                showSubgroupChange={showSubgroupChange} setShowSubgroupChange={setShowSubgroupChange}
                showRestartConfirm={showRestartConfirm} setShowRestartConfirm={setShowRestartConfirm}
                showMonthlyContestInfo={showMonthlyContestInfo} setShowMonthlyContestInfo={setShowMonthlyContestInfo}
                calendarDate={calendarDate} setCalendarDate={setCalendarDate}
                dateSettingsDate={dateSettingsDate} setDateSettingsDate={setDateSettingsDate}
                rankingCommunityFilter={rankingCommunityFilter} setRankingCommunityFilter={setRankingCommunityFilter}
                selectedSubgroupDetail={selectedSubgroupDetail} setSelectedSubgroupDetail={setSelectedSubgroupDetail}
                getSubgroupRanking={getSubgroupRanking}
                getProgressRanking={getProgressRanking}
                getSubgroupDisplay={getSubgroupDisplay}
                generateMemosHTML={generateMemosHTML}
            />
        );
    }
"""

result_lines = lines[:2055] + [new_content + '\n'] + lines[3665:]

with open(target_file, 'w', encoding='utf-8') as f:
    f.writelines(result_lines)

print("Refactoring complete.")
