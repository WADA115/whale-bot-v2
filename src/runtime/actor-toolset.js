export function buildToolset({ biliTools, knowledgeTool, permissionTool, askOwnerTool, forgetTool, confideTool, milestoneTool, diaryTool, readDiaryTool, screenTool, momentTool, speakTool, drawTool, singTool, groupTool }) {
  return [biliTools, knowledgeTool, permissionTool, askOwnerTool, forgetTool, confideTool, milestoneTool, diaryTool, readDiaryTool, screenTool, momentTool, speakTool, drawTool, singTool, groupTool].flat().filter(Boolean);
}
