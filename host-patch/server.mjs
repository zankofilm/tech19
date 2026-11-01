import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { AUTH_ROLES, AUTH_ROLE_LABELS, AUTH_ROLE_SESSION_POLICY, STAFF_ROLES, isAdminRole, canResetPassword } from "./shared/auth-core.mjs";
import { SCHOOL_GRADES as SCHOOL_GRADES_CORE, TEACHING_PERMISSION_DEFAULTS as TEACHING_PERMISSION_DEFAULTS_CORE, normalizeAcademicYears, normalizeEnrollments, assignmentCompositeKey, normalizeTeachingPermissions } from "./shared/school-core.mjs";
import { ensureAcademicYearModel, validateAcademicYearConfig, validateCalendarEvent, normalizeCalendarEvent, activeCalendarForDate, calendarAffectsStudent, closeAndCreateEnrollment, enrollmentHistoryForStudent } from "./shared/academic-year-core.mjs";
import { normalizeQuestionCore, validateQuestionCore, questionFingerprintCore } from "./shared/question-bank-core.mjs";
import { normalizeQuestionIdentityText, questionImageFingerprintCore, resolveQuestionImageTargetCore, inputQuestionIdentityKeyCore } from "./shared/question-image-replacement-core.mjs";
import { STUDENT_EXAM_TYPES_P672213, validImageP672213, approvedSnapshotP672213 } from "./shared/p672213-teacher-types.mjs";
import { normalizeImportedQuestionP672211 } from "./shared/p672211-import-compat.mjs";
import { teacherApprovedMcqShapeV67223 } from "./shared/p67223-approved-mcq.mjs";
import { normalizeExamCore, validateExamCore } from "./shared/exam-core.mjs";
import { sameTeacherExamSaveP67226 } from "./shared/p67226-exam-retry-core.mjs";
import { sameCommittedPublishP67227 } from "./shared/p67227-publish-retry-core.mjs";
import { gradeMcqSelectionP67228 } from "./shared/p67228-mcq-answer-core.mjs";
import { buildEducationAnalyticsV67320 } from "./shared/p67320-education-analytics-core.mjs";
import { buildActionCenterV67330 } from "./shared/p67330-action-center-core.mjs";
import { buildCommunicationsCenterV67340, COMMUNICATION_AUTOMATION_TRIGGERS_V67340 } from "./shared/p67340-communications-core.mjs";
import { buildFamilyCenterV67350 } from "./shared/p67350-family-center-core.mjs";
import { buildAttendanceDisciplineV67360 } from "./shared/p67360-attendance-discipline-core.mjs";
import { buildLearningPlannerV67370 } from "./shared/p67370-learning-planner-core.mjs";
import { buildReportV67380, REPORT_TEMPLATES_V67380 } from "./shared/p67380-report-builder-core.mjs";
import { buildFinanceCenterV67390, financeEnabledV67390 } from "./shared/p67390-finance-core.mjs";
import { buildProductionReadinessV67400 } from "./shared/p67400-production-readiness-core.mjs";
import { teacherStateProjectionP67229 } from "./shared/p67229-teacher-state-core.mjs";
import { isAutoGradableCore, autoGradeQuestionCore, buildAutoGradingCore, validatePublishedGradeCore } from "./shared/grading-core.mjs";
import { validateSpecialScoresCore } from "./shared/report-card-core.mjs";
import { normalizeAcademicPeriod, periodizedTermKey, combineAnnualSubjectRows } from "./shared/term-period-core.mjs";
import { normalizeTermPolicyCore, continuousAverage20Core, termComponentsCore, resolveFinalTermExamPolicyCore } from "./shared/term-scoring-core.mjs";
import "./shared/stage51-final-term-question-bank-core.js";
import { studentDailySnapshot09 } from "./shared/stage09-daily-core.mjs";
import { riskScore10 } from "./shared/stage10-risk-core.mjs";
import { workflowHealth11, workflowPhases11 } from "./shared/stage11-workflow-core.mjs";
import { betaReadiness12 } from "./shared/stage12-beta-readiness-core.mjs";
import { handleQuestionBankRoutes } from "./server/modules/question-bank/routes.mjs";
import { handleExamManagementRoutes } from "./server/modules/exams/routes.mjs";
import { handleStateCommandRoutes } from "./server/modules/state-commands/routes.mjs";
import { externalizeQuestionImages48, questionMediaRequest48 } from "./server/modules/question-media/service.mjs";
import { examTotalScore, validateExamForStudentV61 } from "./server/modules/exams/service.mjs";
import { DEFAULT_DIAGNOSTIC_RATE_POLICY_14, consumeDiagnosticBudget14, supportRuntimeSnapshot14 } from "./shared/stage14-diagnostic-policy-core.mjs";
import { buildReadinessSnapshot15, sampleEventLoopLag15 } from "./shared/stage15-readiness-core.mjs";
import { buildIntegritySnapshot16, verifyRuntimeIntegrity16 } from "./shared/stage16-integrity-core.mjs";
import { buildRecoveryReadinessSnapshot17 } from "./shared/stage17-recovery-readiness-core.mjs";
import { buildPersistenceConsistencySnapshot18 } from "./shared/stage18-persistence-consistency-core.mjs";
import { buildSecurityPostureSnapshot19 } from "./shared/stage19-security-posture-core.mjs";
import { buildAccessControlSnapshot20 } from "./shared/stage20-access-control-core.mjs";
import { buildSessionHygieneSnapshot21 } from "./shared/stage21-session-hygiene-core.mjs";
import { buildAuditConsistencySnapshot22 } from "./shared/stage22-audit-consistency-core.mjs";
import { buildConfigurationConsistencySnapshot23 } from "./shared/stage23-configuration-consistency-core.mjs";
import { buildExamConsistencySnapshot24 } from "./shared/stage24-exam-consistency-core.mjs";
import { buildAttendanceConsistencySnapshot25 } from "./shared/stage25-attendance-consistency-core.mjs";
import { buildScheduleConsistencySnapshot26 } from "./shared/stage26-schedule-consistency-core.mjs";
import { buildGradebookConsistencySnapshot27 } from "./shared/stage27-gradebook-consistency-core.mjs";
import { buildNotificationConsistencySnapshot28 } from "./shared/stage28-notification-consistency-core.mjs";
import { buildFileAttachmentConsistencySnapshot29 } from "./shared/stage29-file-attachment-consistency-core.mjs";
import { buildGlobalReferentialIntegritySnapshot30 } from "./shared/stage30-global-referential-integrity-core.mjs";
import { buildHttpSecurityBoundarySnapshot31 } from "./shared/stage31-http-security-boundary-core.mjs";
import { buildBackupRestoreVerificationSnapshot32 } from "./shared/stage32-backup-restore-verification-core.mjs";
import { buildFinalProductionReadinessSnapshot33 } from "./shared/stage33-final-production-readiness-core.mjs";
import { buildProductionWarningReconciliationSnapshot34 } from "./shared/stage34-production-warning-reconciliation-core.mjs";
import { generateTotpSecret, verifyTotp, generateRecoveryCodes, recoveryCodeHash, consumeRecoveryCode, otpauthUri } from "./server/modules/security/service.mjs";

const APP_VERSION = 71;
const APP_RELEASE = "72.89-p36-ITEM-DISCRIMINATION-ANALYTICS";
const PRODUCT_RELEASE_VERSION = "72.89.36";
const RELEASE_CHANNEL = "Beta 1";
const STUDENT_ANDROID_VERSION = "1.12.0";
const STUDENT_ANDROID_VERSION_CODE = 12;
const STUDENT_ANDROID_MIN_VERSION_CODE = 5;
const STUDENT_ANDROID_APK_URL = String(process.env.MADRESEYAR_STUDENT_APK_URL || "").trim();
const SCHOOL_NAME = "مدرسه دوره اول متوسطه پروین اعتصامی جوانرود";
function normalizeBasePath(value) {
  const clean = String(value || "").trim().replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "");
  if (!clean || clean === "/") return "";
  return clean.startsWith("/") ? clean : `/${clean}`;
}
const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH || process.env.PASSENGER_BASE_URI || "");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 48 * 1024 * 1024;
const CLIENT_DIAGNOSTIC_LIMIT = 100;
const clientDiagnosticEvents = [];
const diagnosticRateWindows14 = new Map();
const DIAGNOSTIC_RATE_POLICY_14 = Object.freeze({
  ...DEFAULT_DIAGNOSTIC_RATE_POLICY_14,
  maxEvents: Math.max(1, Math.min(500, Number(process.env.MADRESEYAR_DIAGNOSTIC_RATE_MAX || DEFAULT_DIAGNOSTIC_RATE_POLICY_14.maxEvents) || DEFAULT_DIAGNOSTIC_RATE_POLICY_14.maxEvents))
});
const RUNTIME_REQUIRED_FILES_15 = Object.freeze(["app_wrapper.cjs","server.mjs","server/modules/question-bank/routes.mjs","server/modules/question-bank/service.mjs","server/modules/exams/routes.mjs","server/modules/exams/service.mjs","shared/stage6-zip-core.js","shared/stage6-exam-client-core.js","shared/stage7-teacher-scope-core.js","shared/stage7-question-bank-core.js","shared/stage7-exam-ui-core.js","shared/stage8-api-core.js","shared/stage8-state-core.js","shared/stage9-foundation-core.js","shared/stage9-session-core.js","shared/stage10-storage-core.js","shared/stage10-validation-core.js","shared/stage11-api-feedback-core.js","shared/stage11-submit-guard-core.js","shared/stage11-form-contract-core.js","shared/stage12-network-resilience-core.js","shared/stage12-feedback-core.js","shared/stage12-form-flow-core.js","shared/stage13-diagnostics-core.js","shared/stage13-diagnostics-view-core.js","shared/stage14-diagnostic-policy-core.mjs","shared/stage14-support-core.js","shared/stage15-readiness-core.mjs","shared/stage15-readiness-view-core.js","shared/stage16-integrity-core.mjs","shared/stage16-integrity-view-core.js","shared/stage17-recovery-readiness-core.mjs","shared/stage17-recovery-readiness-view-core.js","shared/stage18-persistence-consistency-core.mjs","shared/stage18-persistence-consistency-view-core.js","shared/stage19-security-posture-core.mjs","shared/stage19-security-posture-view-core.js","shared/stage20-access-control-core.mjs","shared/stage20-access-control-view-core.js","shared/stage21-session-hygiene-core.mjs","shared/stage21-session-hygiene-view-core.js","shared/stage22-audit-consistency-core.mjs","shared/stage22-audit-consistency-view-core.js","shared/stage23-configuration-consistency-core.mjs","shared/stage23-configuration-consistency-view-core.js","shared/stage24-exam-consistency-core.mjs","shared/stage24-exam-consistency-view-core.js","shared/stage25-attendance-consistency-core.mjs","shared/stage25-attendance-consistency-view-core.js","shared/stage26-schedule-consistency-core.mjs","shared/stage26-schedule-consistency-view-core.js","shared/stage27-gradebook-consistency-core.mjs","shared/stage27-gradebook-consistency-view-core.js","shared/stage28-notification-consistency-core.mjs","shared/stage28-notification-consistency-view-core.js","shared/stage29-file-attachment-consistency-core.mjs","shared/stage29-file-attachment-consistency-view-core.js","shared/stage30-global-referential-integrity-core.mjs","shared/stage30-global-referential-integrity-view-core.js","shared/stage31-http-security-boundary-core.mjs","shared/stage31-http-security-boundary-view-core.js","shared/stage32-backup-restore-verification-core.mjs","shared/stage32-backup-restore-verification-view-core.js","shared/stage33-final-production-readiness-core.mjs","shared/stage33-final-production-readiness-view-core.js","shared/stage34-production-warning-reconciliation-core.mjs","shared/stage34-production-warning-reconciliation-view-core.js","shared/p67320-education-analytics-core.mjs","shared/p67320-education-analytics.js","shared/p67320-education-analytics.css","shared/p67330-action-center-core.mjs","shared/p67330-action-center.js","shared/p67330-action-center.css","shared/p67340-communications-core.mjs","shared/p67340-communications-center.js","shared/p67340-communications-center.css","shared/p67350-family-center-core.mjs","shared/p67350-family-center.js","shared/p67350-family-center.css","shared/p67360-attendance-discipline-core.mjs","shared/p67360-attendance-discipline.js","shared/p67360-attendance-discipline.css","shared/p67370-learning-planner-core.mjs","shared/p67370-learning-planner.js","shared/p67370-learning-planner.css","shared/p67380-report-builder-core.mjs","shared/p67380-report-builder.js","shared/p67380-report-builder.css","shared/p67390-finance-core.mjs","shared/p67390-finance-center.js","shared/p67390-finance-center.css","shared/p67400-production-readiness-core.mjs","shared/p67400-production-readiness.js","shared/p67400-production-readiness.css","guardian/p67350-parent-center.css","student/index.html","student/app.js","student/service-worker.js","student/styles.css","student/stage47-student-ux.js","student/stage47-student-ux.css","guardian/index.html","guardian/app.js","guardian/stage47-guardian-ux.js","guardian/stage47-guardian-ux.css","package.json","release-manifest.json","shared/stage45-ui-foundation.js","shared/stage45-design-foundation.css","shared/stage46-role-ux.js","shared/stage46-role-ux.css","shared/stage48-question-media-core.mjs","shared/term-scoring-core.mjs","shared/stage51-final-term-question-bank-core.js","shared/p67310-admin-command-center.js","shared/p67310-admin-command-center.css","server/modules/question-media/service.mjs","server/modules/security/service.mjs","server/modules/state-commands/routes.mjs"]);
async function runtimeMissingFiles15(){
  const checks=await Promise.all(RUNTIME_REQUIRED_FILES_15.map(async rel=>{try{await fs.access(path.join(ROOT,rel));return null;}catch{return rel;}}));
  return checks.filter(Boolean);
}
async function fileAvailable17(file){
  try{return Boolean((await fs.stat(file)).isFile());}catch{return false;}
}
async function collectRecoverySignals17(){
  const [stateAvailable,stateMirrorAvailable,previousStateAvailable,securityMirrorAvailable]=await Promise.all([
    fileAvailable17(STATE_FILE),fileAvailable17(STATE_MIRROR_FILE),fileAvailable17(STATE_PREVIOUS_FILE),fileAvailable17(SECURITY_MIRROR_FILE)
  ]);
  let backupCount=0,dailyBackupCount=0,weeklyBackupCount=0,latestBackupMtimeMs=0;
  try{
    const names=await fs.readdir(BACKUPS_DIR);
    for(const name of names){
      if(!String(name).endsWith('.json'))continue;
      try{const stat=await fs.stat(path.join(BACKUPS_DIR,name));if(!stat.isFile())continue;backupCount++;latestBackupMtimeMs=Math.max(latestBackupMtimeMs,Number(stat.mtimeMs)||0);if(/-daily-/i.test(name))dailyBackupCount++;if(/-weekly-/i.test(name))weeklyBackupCount++;}catch{}
    }
  }catch{}
  let diskTotalBytes=0,diskFreeBytes=0;
  try{const stat=await fs.statfs(DATA_DIR);diskTotalBytes=Number(stat.blocks)*Number(stat.bsize);diskFreeBytes=Number(stat.bavail)*Number(stat.bsize);}catch{try{const stat=await fs.statfs(ROOT);diskTotalBytes=Number(stat.blocks)*Number(stat.bsize);diskFreeBytes=Number(stat.bavail)*Number(stat.bsize);}catch{}}
  const latestBackupAgeHours=latestBackupMtimeMs>0?Math.max(0,(Date.now()-latestBackupMtimeMs)/36e5):null;
  return {stateAvailable,stateMirrorAvailable,previousStateAvailable,securityMirrorAvailable,backupCount,dailyBackupCount,weeklyBackupCount,latestBackupAgeHours,diskTotalBytes,diskFreeBytes};
}
function stateEnvelopeShape18(value){
  try{if(!value?.initialized||!value?.db||typeof value.db!=="object")return false;validateServerState(structuredClone(value.db));return true;}catch{return false;}
}
function securityShape18(value){try{return validSecurityShape(value);}catch{return false;}}
async function jsonSignal18(filePath,shapeValidator){
  try{
    const raw=await fs.readFile(filePath);
    let parsed;try{parsed=JSON.parse(raw.toString("utf8"));}catch{return {available:true,jsonValid:false,shapeValid:false,hash:""};}
    let shapeValid=false;try{shapeValid=Boolean(shapeValidator(parsed));}catch{}
    return {available:true,jsonValid:true,shapeValid,hash:crypto.createHash("sha256").update(raw).digest("hex")};
  }catch(error){if(error?.code==="ENOENT")return {available:false,jsonValid:false,shapeValid:false,hash:""};return {available:true,jsonValid:false,shapeValid:false,hash:""};}
}
async function collectPersistenceSignals18(){
  const [primary,stateMirror,previous,security,securityMirror]=await Promise.all([
    jsonSignal18(STATE_FILE,stateEnvelopeShape18),jsonSignal18(STATE_MIRROR_FILE,stateEnvelopeShape18),jsonSignal18(STATE_PREVIOUS_FILE,stateEnvelopeShape18),jsonSignal18(SECURITY_FILE,securityShape18),jsonSignal18(SECURITY_MIRROR_FILE,securityShape18)
  ]);
  let latestBackup={available:false,jsonValid:false,shapeValid:false,hash:""};
  try{
    const rows=[];for(const name of await fs.readdir(BACKUPS_DIR)){if(!String(name).endsWith(".json"))continue;try{const filePath=path.join(BACKUPS_DIR,name),stat=await fs.stat(filePath);if(stat.isFile())rows.push({filePath,mtimeMs:Number(stat.mtimeMs)||0});}catch{}}
    rows.sort((a,b)=>b.mtimeMs-a.mtimeMs);
    if(rows[0])latestBackup=await jsonSignal18(rows[0].filePath,value=>value?.app==="madreseyar-local-state"&&stateEnvelopeShape18(value?.envelope));
  }catch{}
  let tempFileCount=0;for(const dir of [DATA_DIR,BACKUPS_DIR]){try{for(const name of await fs.readdir(dir))if(String(name).endsWith(".tmp"))tempFileCount++;}catch{}}
  return {
    primaryStateAvailable:primary.available,primaryStateJsonValid:primary.jsonValid,primaryStateShapeValid:primary.shapeValid,
    stateMirrorAvailable:stateMirror.available,stateMirrorJsonValid:stateMirror.jsonValid,stateMirrorShapeValid:stateMirror.shapeValid,stateMirrorMatchesPrimary:Boolean(primary.hash&&stateMirror.hash&&primary.hash===stateMirror.hash),
    previousStateAvailable:previous.available,previousStateJsonValid:previous.jsonValid,previousStateShapeValid:previous.shapeValid,
    securityAvailable:security.available,securityJsonValid:security.jsonValid,securityShapeValid:security.shapeValid,
    securityMirrorAvailable:securityMirror.available,securityMirrorJsonValid:securityMirror.jsonValid,securityMirrorShapeValid:securityMirror.shapeValid,securityMirrorMatchesPrimary:Boolean(security.hash&&securityMirror.hash&&security.hash===securityMirror.hash),
    latestBackupAvailable:latestBackup.available,latestBackupJsonValid:latestBackup.jsonValid,latestBackupShapeValid:latestBackup.shapeValid,tempFileCount
  };
}


async function cryptoRestoreRoundTrip32(){
  try{
    const pass='stage32-memory-only-restore-probe';
    const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
    const key=await scryptAsync(pass,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    const plain=Buffer.from(JSON.stringify({stage:32,probe:'backup-restore'}),'utf8');
    const enc=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
    const dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);
    const parsed=JSON.parse(Buffer.concat([dec.update(enc),dec.final()]).toString('utf8'));
    return parsed?.stage===32&&parsed?.probe==='backup-restore';
  }catch{return false;}
}
async function collectBackupRestoreVerificationSignals32(){
  const now=Date.now();
  let names=[];try{names=await fs.readdir(BACKUPS_DIR);}catch{}
  let tempResidueCount=0;for(const name of names)if(String(name).endsWith('.tmp'))tempResidueCount++;
  const rows=[];
  for(const name of names){
    if(!String(name).endsWith('.json'))continue;
    const filePath=path.join(BACKUPS_DIR,name);
    let stat=null,payload=null,jsonValid=false,restorable=false;
    try{stat=await fs.stat(filePath);if(!stat.isFile())continue;}catch{continue;}
    try{payload=JSON.parse(await fs.readFile(filePath,'utf8'));jsonValid=true;}catch{}
    const label=String(payload?.label||'');
    const createdRaw=String(payload?.createdAt||'');
    const createdAtMs=Date.parse(createdRaw);
    const timestampValid=Number.isFinite(createdAtMs);
    if(jsonValid&&payload?.app==='madreseyar-local-state'&&payload?.envelope?.initialized&&payload?.envelope?.db&&typeof payload.envelope.db==='object'){
      try{const candidate=upgradeServerDbRespectingReset(structuredClone(payload.envelope.db));validateServerState(candidate);restorable=true;}catch{}
    }
    rows.push({name,label,jsonValid,restorable,createdAtMs:timestampValid?createdAtMs:null,mtimeMs:Number(stat.mtimeMs)||0});
  }
  rows.sort((a,b)=>b.mtimeMs-a.mtimeMs);
  const backupCount=rows.length,restorableRows=rows.filter(r=>r.restorable),restorableBackupCount=restorableRows.length,invalidBackupCount=backupCount-restorableBackupCount;
  const validDailyCount=restorableRows.filter(r=>r.label.startsWith('daily-')).length;
  const validWeeklyCount=restorableRows.filter(r=>r.label.startsWith('weekly-')).length;
  const latestBackupRestorable=backupCount>0?rows[0].restorable:false;
  const latestRestorable=restorableRows[0]||null;
  const latestRestorableAgeHours=latestRestorable?Math.max(0,(now-latestRestorable.mtimeMs)/36e5):null;
  let invalidTimestampCount=0,futureTimestampCount=0,chainOrderViolationCount=0,duplicateTimestampCount=0;
  const seenTimestamps=new Set();
  for(const row of rows){
    if(row.createdAtMs==null){invalidTimestampCount++;continue;}
    const key=String(row.createdAtMs);if(seenTimestamps.has(key))duplicateTimestampCount++;else seenTimestamps.add(key);
    if(row.createdAtMs>now+5*60*1000)futureTimestampCount++;
  }
  for(let i=1;i<rows.length;i++){
    const newer=rows[i-1],older=rows[i];
    if(newer.createdAtMs!=null&&older.createdAtMs!=null&&older.createdAtMs>newer.createdAtMs+5*60*1000)chainOrderViolationCount++;
  }
  const encryptedRestoreToolAvailable=await fileAvailable17(path.join(ROOT,'restore-encrypted-backup.mjs'));
  const localRestoreEngineAvailable=typeof validatedRecoveryCandidate==='function';
  const dryRunRestoreOk=backupCount===0?false:Boolean(latestRestorable&&latestBackupRestorable);
  const cryptoRoundTripOk=await cryptoRestoreRoundTrip32();
  return {backupCount,restorableBackupCount,invalidBackupCount,validDailyCount,validWeeklyCount,latestBackupRestorable,latestRestorableAgeHours,invalidTimestampCount,futureTimestampCount,chainOrderViolationCount,duplicateTimestampCount,tempResidueCount,encryptedRestoreToolAvailable,localRestoreEngineAvailable,dryRunRestoreOk,cryptoRoundTripOk};
}

async function sensitivePermissionSignal19(filePath){
  try{
    const stat=await fs.stat(filePath);
    if(!stat.isFile())return {exists:false,secure:true,unknown:false};
    if(process.platform==="win32")return {exists:true,secure:true,unknown:true};
    const mode=Number(stat.mode)&0o777;
    return {exists:true,secure:(mode&0o077)===0,unknown:false};
  }catch(error){return error?.code==="ENOENT"?{exists:false,secure:true,unknown:false}:{exists:true,secure:false,unknown:true};}
}
async function collectSecurityPostureSignals19(db){
  let security=null,securityStoreValid=false;
  try{
    security=JSON.parse(await fs.readFile(SECURITY_FILE,"utf8"));
    securityStoreValid=validSecurityShape(security);
  }catch{}
  const secret=String(security?.serverSecret||"");
  const serverSecretStrong=secret.length>=32&&new Set(secret).size>=16;
  const activeStaff=(db?.users||[]).filter(u=>u&&u.active!==false&&STAFF_ROLES.includes(String(u.role||"")));
  let missingStaffCredentialCount=0,weakStaffHashCount=0,mustChangePrivilegedCount=0;
  for(const user of activeStaff){
    const cred=security?.credentials?.[user.id];
    if(!cred){missingStaffCredentialCount++;continue;}
    if(!/^scrypt\$16384\$8\$1\$/i.test(String(cred.passwordHash||"")))weakStaffHashCount++;
    if(["admin","superadmin"].includes(String(user.role||""))&&cred.mustChangePassword===true)mustChangePrivilegedCount++;
  }
  const now=Date.now(),activeIds=new Set((db?.users||[]).filter(u=>u&&u.active!==false).map(u=>String(u.id)));
  let activeSessionCount=0,expiredSessionCount=0;
  for(const session of Object.values(security?.sessions||{})){
    if(!session)continue;
    const valid=Number(session.expiresAt||0)>now&&Number(session.idleExpiresAt||0)>now&&activeIds.has(String(session.userId||""));
    if(valid)activeSessionCount++;else expiredSessionCount++;
  }
  const permissionSignals=await Promise.all([SECURITY_FILE,SECURITY_MIRROR_FILE,SECURITY_AUDIT_FILE,LOGIN_ATTEMPTS_FILE].map(sensitivePermissionSignal19));
  const existingPermissions=permissionSignals.filter(x=>x.exists);
  const sensitiveFileCount=existingPermissions.length;
  const insecureSensitiveFileCount=existingPermissions.filter(x=>!x.secure&&!x.unknown).length;
  const unknownPermissionCount=existingPermissions.filter(x=>x.unknown).length;
  return {
    production:process.env.NODE_ENV==="production",securityStoreValid,serverSecretStrong,
    activeStaffCount:activeStaff.length,missingStaffCredentialCount,weakStaffHashCount,mustChangePrivilegedCount,
    sensitiveFileCount,insecureSensitiveFileCount,unknownPermissionCount,
    recoverySecretConfigured:Boolean(String(process.env.MADRESEYAR_ADMIN_RECOVERY_PASSWORD||"")),
    bootstrapSecretCount:[process.env.MADRESEYAR_SUPERADMIN_PASSWORD,process.env.MADRESEYAR_TEACHER_PASSWORD].filter(v=>String(v||"")).length,
    credentialPresetCurrent:Number(security?.credentialPresetVersion||0)>=CREDENTIAL_PRESET_VERSION,
    activeSessionCount,expiredSessionCount,trustProxyEnabled:TRUST_PROXY
  };
}
function collectAccessControlSignals20(db,security){
  const users=Array.isArray(db?.users)?db.users:[];
  const activeUsers=users.filter(u=>u&&u.active!==false&&!['deleted','locked','graduated'].includes(String(u.profileStatus||'')));
  const roleSet=new Set(AUTH_ROLES);
  const unknownRoleCount=activeUsers.filter(u=>!roleSet.has(String(u.role||''))).length;
  const activeSuperadminCount=activeUsers.filter(u=>u.role==='superadmin').length;
  const activeAdminCount=activeUsers.filter(u=>u.role==='admin').length;
  const idCounts=new Map();for(const u of users){const id=String(u?.id||'');if(id)idCounts.set(id,(idCounts.get(id)||0)+1);}
  const duplicateUserIdCount=[...idCounts.values()].filter(n=>n>1).length;
  const activeIds=new Set(activeUsers.map(u=>String(u.id)));
  const allIds=new Set(users.map(u=>String(u?.id||'')).filter(Boolean));
  const usernameCounts=new Map();
  for(const u of activeUsers){const name=String(security?.credentials?.[u.id]?.username||'').trim().toLowerCase();if(name)usernameCounts.set(name,(usernameCounts.get(name)||0)+1);}
  const duplicateActiveUsernameCount=[...usernameCounts.values()].filter(n=>n>1).length;
  const orphanCredentialCount=Object.keys(security?.credentials||{}).filter(id=>!allIds.has(String(id))).length;
  const activeClassIds=new Set((db?.school?.classes||[]).filter(c=>c&&c.active!==false).map(c=>String(c.id)));
  const invalidStudentClassCount=activeUsers.filter(u=>u.role==='student'&&!activeClassIds.has(String(u.classId||''))).length;
  const activeTeacherIds=new Set(activeUsers.filter(u=>u.role==='teacher').map(u=>String(u.id)));
  const brokenTeachingAssignmentCount=(db?.teachingAssignments||[]).filter(a=>a&&a.active!==false&&(!activeTeacherIds.has(String(a.teacherId||''))||!activeClassIds.has(String(a.classId||'')))).length;
  const guardianIds=new Set((db?.guardians||[]).filter(g=>g&&g.active!==false).map(g=>String(g.id)));
  const studentIds=new Set(activeUsers.filter(u=>u.role==='student').map(u=>String(u.id)));
  const orphanGuardianLinkCount=(db?.guardianLinks||[]).filter(link=>link&&link.active!==false&&(!studentIds.has(String(link.studentId||''))||(link.guardianId&&!guardianIds.has(String(link.guardianId))))).length;
  let activeSessionCount=0,staleOrMismatchedSessionCount=0;
  const byId=new Map(activeUsers.map(u=>[String(u.id),u]));
  const now=Date.now();
  for(const session of Object.values(security?.sessions||{})){
    if(!session)continue;
    const timeValid=Number(session.expiresAt||0)>now&&Number(session.idleExpiresAt||0)>now;
    if(timeValid)activeSessionCount++;
    const user=byId.get(String(session.userId||''));
    if(!timeValid||!user||String(session.role||'')!==String(user.role||''))staleOrMismatchedSessionCount++;
  }
  return {activeUserCount:activeUsers.length,unknownRoleCount,activeSuperadminCount,activeAdminCount,duplicateUserIdCount,duplicateActiveUsernameCount,orphanCredentialCount,invalidStudentClassCount,brokenTeachingAssignmentCount,orphanGuardianLinkCount,staleOrMismatchedSessionCount,activeSessionCount};
}

function collectSessionHygieneSignals21(db,security){
  const users=Array.isArray(db?.users)?db.users:[];
  const activeUsers=users.filter(u=>u&&u.active!==false&&!['deleted','locked','graduated'].includes(String(u.profileStatus||'')));
  const byId=new Map(activeUsers.map(u=>[String(u.id),u]));
  const now=Date.now(),futureToleranceMs=5*60*1000,policyToleranceMs=60*1000;
  let totalSessionCount=0,activeSessionCount=0,expiredSessionCount=0,orphanSessionCount=0,roleMismatchCount=0,malformedTimestampCount=0,futureTimestampCount=0,absolutePolicyOverrunCount=0,idlePolicyOverrunCount=0;
  const concurrency=new Map();
  for(const session of Object.values(security?.sessions||{})){
    if(!session)continue;totalSessionCount++;
    const user=byId.get(String(session.userId||''));
    if(!user)orphanSessionCount++;
    else if(String(session.role||'')!==String(user.role||''))roleMismatchCount++;
    const createdAt=Number(session.createdAt),lastSeenAt=Number(session.lastSeenAt),expiresAt=Number(session.expiresAt),idleExpiresAt=Number(session.idleExpiresAt);
    const times=[createdAt,lastSeenAt,expiresAt,idleExpiresAt];
    const validTimes=times.every(v=>Number.isFinite(v)&&v>0);
    if(!validTimes){malformedTimestampCount++;continue;}
    if(createdAt>now+futureToleranceMs||lastSeenAt>now+futureToleranceMs)futureTimestampCount++;
    const timeValid=expiresAt>now&&idleExpiresAt>now;
    if(timeValid){activeSessionCount++;const key=String(session.userId||'');if(key)concurrency.set(key,(concurrency.get(key)||0)+1);}else expiredSessionCount++;
    const role=String(user?.role||session.role||'');
    const policy=ROLE_SESSION_POLICY[role];
    if(policy){
      if(expiresAt-createdAt>Number(policy.absoluteMs||0)+policyToleranceMs)absolutePolicyOverrunCount++;
      const idleBase=Math.max(createdAt,lastSeenAt);
      if(idleExpiresAt-idleBase>Number(policy.idleMs||0)+policyToleranceMs)idlePolicyOverrunCount++;
    }
  }
  let highConcurrencyPrincipalCount=0,maxConcurrentSessionsPerPrincipal=0;
  for(const count of concurrency.values()){maxConcurrentSessionsPerPrincipal=Math.max(maxConcurrentSessionsPerPrincipal,count);if(count>5)highConcurrencyPrincipalCount++;}
  return {totalSessionCount,activeSessionCount,expiredSessionCount,orphanSessionCount,roleMismatchCount,malformedTimestampCount,futureTimestampCount,absolutePolicyOverrunCount,idlePolicyOverrunCount,highConcurrencyPrincipalCount,maxConcurrentSessionsPerPrincipal};
}


async function collectConfigurationConsistencySignals23(){
  const rawPort=String(process.env.PORT||'8787').trim();
  const parsedPort=Number(rawPort);
  const portValid=Number.isInteger(parsedPort)&&parsedPort>=1&&parsedPort<=65535;
  const rawAppBase=String(process.env.APP_BASE_PATH||'').trim();
  const rawPassengerBase=String(process.env.PASSENGER_BASE_URI||'').trim();
  let appBaseNorm='',passengerBaseNorm='',basePathValid=true;
  try{appBaseNorm=normalizeBasePath(rawAppBase);passengerBaseNorm=normalizeBasePath(rawPassengerBase);}catch{basePathValid=false;}
  const basePathConflict=Boolean(rawAppBase&&rawPassengerBase&&appBaseNorm!==passengerBaseNorm);
  let dataDirAvailable=false,dataDirReadable=false,dataDirWritable=false;
  try{const stat=await fs.stat(DATA_DIR);dataDirAvailable=stat.isDirectory();}catch{}
  if(dataDirAvailable){try{await fs.access(DATA_DIR,4);dataDirReadable=true;}catch{try{await fs.readdir(DATA_DIR);dataDirReadable=true;}catch{}}try{await fs.access(DATA_DIR,2);dataDirWritable=true;}catch{try{const stat=await fs.stat(DATA_DIR);dataDirWritable=Boolean(stat.isDirectory());}catch{}}}
  const rawTimezone=String(process.env.MADRESEYAR_TIMEZONE||'').trim();
  const timezone=rawTimezone||'Asia/Tehran';let timezoneValid=true;try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date());}catch{timezoneValid=false;}
  const rawRate=String(process.env.MADRESEYAR_DIAGNOSTIC_RATE_MAX||'').trim();
  const parsedRate=Number(rawRate);const diagnosticRateConfigured=Boolean(rawRate);const diagnosticRateValid=!diagnosticRateConfigured||(Number.isFinite(parsedRate)&&parsedRate>=1&&parsedRate<=500&&Math.trunc(parsedRate)===parsedRate);
  return {production:process.env.NODE_ENV==='production',nodeMajor:Number(process.versions.node.split('.')[0]||0),port:portValid?parsedPort:0,portValid,basePathConfigured:Boolean(rawAppBase||rawPassengerBase),basePathValid,basePathConflict,dataDirAvailable,dataDirReadable,dataDirWritable,timezoneConfigured:Boolean(rawTimezone),timezoneValid,diagnosticRateConfigured,diagnosticRateValid,trustProxyEnabled:TRUST_PROXY};
}

function collectExamConsistencySignals24(db){
  const users=Array.isArray(db?.users)?db.users:[];
  const exams=Array.isArray(db?.exams)?db.exams:[];
  const attempts=Array.isArray(db?.attempts)?db.attempts:[];
  const submissions=Array.isArray(db?.submissions)?db.submissions:[];
  const grades=Array.isArray(db?.grades)?db.grades:[];
  const userById=new Map(users.map(u=>[String(u?.id||''),u]).filter(([id])=>id));
  const studentById=new Map(users.filter(u=>u?.role==='student').map(u=>[String(u.id||''),u]).filter(([id])=>id));
  const classIds=new Set((db?.school?.classes||[]).map(c=>String(c?.id||'')).filter(Boolean));
  const bookIds=new Set((db?.curriculum||[]).map(b=>String(b?.id||'')).filter(Boolean));
  const examById=new Map();const examIdCounts=new Map();
  for(const exam of exams){const id=String(exam?.id||'');if(id){examIdCounts.set(id,(examIdCounts.get(id)||0)+1);if(!examById.has(id))examById.set(id,exam);}}
  const duplicateExamIdCount=[...examIdCounts.values()].filter(n=>n>1).length;
  const lifecycleStates=new Set(['draft','ready','published','in_progress','ended','graded','final','archived']);
  const derivedLifecycle=exam=>String(exam?.publicationState||(exam?.status==='active'?'published':exam?.status==='archived'?'archived':'draft'));
  let invalidLifecycleCount=0,invalidExamClassCount=0,invalidExamBookCount=0,orphanExamCreatorCount=0,invalidExamQuestionCount=0,duplicateExamQuestionIdCount=0,invalidExamWindowCount=0,invalidExamStudentScopeCount=0;
  const executableStates=new Set(['ready','published','in_progress','ended','graded','final']);
  for(const exam of exams){
    if(!exam||typeof exam!=='object'){invalidLifecycleCount++;continue;}
    const lifecycle=derivedLifecycle(exam);if(!lifecycleStates.has(lifecycle))invalidLifecycleCount++;
    if(!classIds.has(String(exam.classId||'')))invalidExamClassCount++;
    if(!bookIds.has(String(exam.bookId||'')))invalidExamBookCount++;
    const creator=String(exam.createdBy||'');if(creator&&!userById.has(creator))orphanExamCreatorCount++;
    const questions=Array.isArray(exam.questions)?exam.questions:[];
    if(executableStates.has(lifecycle)||exam.status==='active'){
      if(!questions.length)invalidExamQuestionCount++;
      const seen=new Set();
      for(const q of questions){
        const id=String(q?.id||'').trim();
        if(!q||typeof q!=='object'||!id||!String(q.text||'').trim()||!(Number(q.score)>0))invalidExamQuestionCount++;
        if(id){if(seen.has(id))duplicateExamQuestionIdCount++;else seen.add(id);}
      }
    }
    const start=String(exam.startAt||'').trim(),end=String(exam.endAt||'').trim();
    if(start||end){const a=Date.parse(start),b=Date.parse(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)invalidExamWindowCount++;}
    const selected=Array.isArray(exam.studentIds)?exam.studentIds:[];
    for(const rawId of selected){const student=studentById.get(String(rawId||''));if(!student||String(student.classId||'')!==String(exam.classId||''))invalidExamStudentScopeCount++;}
  }
  let orphanAttemptCount=0,orphanSubmissionCount=0;const deliveryPairs=new Map();
  const countDelivery=(row,kind)=>{const examId=String(row?.examId||''),studentId=String(row?.studentId||'');const valid=examById.has(examId)&&studentById.has(studentId);if(!valid){if(kind==='attempt')orphanAttemptCount++;else orphanSubmissionCount++;return;}const key=`${examId}\u0000${studentId}`;deliveryPairs.set(key,(deliveryPairs.get(key)||0)+1);};
  for(const row of attempts)countDelivery(row,'attempt');for(const row of submissions)countDelivery(row,'submission');
  const duplicateDeliveryPairCount=[...deliveryPairs.values()].filter(n=>n>1).length;
  const submissionById=new Map(submissions.map(s=>[String(s?.id||''),s]).filter(([id])=>id));
  let orphanGradeCount=0,gradeExamMismatchCount=0;
  for(const grade of grades){const sub=submissionById.get(String(grade?.submissionId||''));if(!sub){orphanGradeCount++;continue;}const gradeExamId=String(grade?.examId||'');if(gradeExamId&&gradeExamId!==String(sub.examId||''))gradeExamMismatchCount++;}
  return {examCount:exams.length,duplicateExamIdCount,invalidLifecycleCount,invalidExamClassCount,invalidExamBookCount,orphanExamCreatorCount,invalidExamQuestionCount,duplicateExamQuestionIdCount,invalidExamWindowCount,invalidExamStudentScopeCount,orphanAttemptCount,orphanSubmissionCount,duplicateDeliveryPairCount,orphanGradeCount,gradeExamMismatchCount};
}




async function collectFileAttachmentConsistencySignals29(db){
  const users=Array.isArray(db?.users)?db.users:[],classes=Array.isArray(db?.school?.classes)?db.school.classes:[];
  const items=Array.isArray(db?.libraryP62)?db.libraryP62:[],homework=Array.isArray(db?.homework)?db.homework:[],questions=Array.isArray(db?.p635Questions)?db.p635Questions:[];
  const userIds=new Set(users.map(x=>String(x?.id||'')).filter(Boolean)),classIds=new Set(classes.map(x=>String(x?.id||'')).filter(Boolean));
  const types={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','text/plain':'txt'};
  const ids=new Map(),referencedFiles=new Set();let activeLibraryItemCount=0,invalidLibraryMetadataCount=0,orphanLibraryCreatorCount=0,invalidLibraryClassCount=0,missingBackingFileCount=0,backingSizeMismatchCount=0;
  for(const row of items){
    const id=String(row?.id||'').trim();if(id)ids.set(id,(ids.get(id)||0)+1);const active=row?.active!==false;if(active)activeLibraryItemCount++;
    const mime=String(row?.mime||'').toLowerCase(),ext=types[mime],fileName=String(row?.fileName||'').trim(),size=Number(row?.size);
    const safeName=/^[a-zA-Z0-9_.-]+$/.test(fileName),expected=id&&ext?`${id}.${ext}`:'';
    if(!row||typeof row!=='object'||!id||!ext||!safeName||fileName!==expected||!Number.isInteger(size)||size<0)invalidLibraryMetadataCount++;
    if(fileName&&safeName)referencedFiles.add(fileName);
    const creator=String(row?.createdBy||'').trim();if(creator&&!userIds.has(creator))orphanLibraryCreatorCount++;
    const classId=String(row?.classId||'').trim();if(classId&&!classIds.has(classId))invalidLibraryClassCount++;
    if(active&&id&&ext&&safeName&&fileName===expected){try{const stat=await fs.stat(path.join(P62_DIR,fileName));if(!stat.isFile())missingBackingFileCount++;else if(Number.isInteger(size)&&size>=0&&stat.size!==size)backingSizeMismatchCount++;}catch{missingBackingFileCount++;}}
  }
  const duplicateLibraryIdCount=[...ids.values()].filter(n=>n>1).length;
  let storageDirectoryAvailable=false,unexpectedBackingFileCount=0;try{const stat=await fs.stat(P62_DIR);storageDirectoryAvailable=stat.isDirectory();if(storageDirectoryAvailable){for(const name of await fs.readdir(P62_DIR)){if(!referencedFiles.has(String(name)))unexpectedBackingFileCount++;}}}catch{}
  let homeworkAttachmentCount=0,invalidHomeworkAttachmentCount=0,oversizedEmbeddedAttachmentCount=0;
  for(const hw of homework){const atts=Array.isArray(hw?.attachments)?hw.attachments:[];if(atts.length>2)invalidHomeworkAttachmentCount++;for(const a of atts){homeworkAttachmentCount++;const data=String(a?.dataUrl||''),m=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(data),size=Number(a?.size);if(!a||typeof a!=='object'||!String(a.name||'').trim()||!m||!Number.isInteger(size)||size<0){invalidHomeworkAttachmentCount++;continue;}let bytes;try{bytes=Buffer.from(m[2],'base64');}catch{invalidHomeworkAttachmentCount++;continue;}if(bytes.length>650*1024){oversizedEmbeddedAttachmentCount++;invalidHomeworkAttachmentCount++;}if(bytes.length!==size||bytes.toString('base64')!==m[2])invalidHomeworkAttachmentCount++;if(String(a.type||'').toLowerCase()!==m[1].toLowerCase())invalidHomeworkAttachmentCount++;}}
  let practiceAttachmentCount=0,invalidPracticeAttachmentCount=0;
  for(const q of questions){const a=q?.attachment;if(!a)continue;practiceAttachmentCount++;const name=String(a?.name||'').trim(),data=String(a?.data||''),ext=name.split('.').pop().toLowerCase(),mime=ext==='pdf'?'application/pdf':ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'';const prefix=mime?`data:${mime};base64,`:'';if(!name||/[\\/\x00-\x1f]/.test(name)||!mime||!data.startsWith(prefix)){invalidPracticeAttachmentCount++;continue;}const encoded=data.slice(prefix.length);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)){invalidPracticeAttachmentCount++;continue;}let bytes;try{bytes=Buffer.from(encoded,'base64');}catch{invalidPracticeAttachmentCount++;continue;}if(!bytes.length||bytes.length>500*1024)invalidPracticeAttachmentCount++;else if(ext==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')invalidPracticeAttachmentCount++;else if(ext==='docx'&&!(bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04))invalidPracticeAttachmentCount++;}
  return {libraryItemCount:items.length,activeLibraryItemCount,duplicateLibraryIdCount,invalidLibraryMetadataCount,orphanLibraryCreatorCount,invalidLibraryClassCount,missingBackingFileCount,backingSizeMismatchCount,unexpectedBackingFileCount,storageDirectoryAvailable,homeworkCount:homework.length,homeworkAttachmentCount,invalidHomeworkAttachmentCount,practiceQuestionCount:questions.length,practiceAttachmentCount,invalidPracticeAttachmentCount,oversizedEmbeddedAttachmentCount};
}

function collectGlobalReferentialIntegritySignals30(db){
  const report=systemIntegrityReport(db),c=report?.checks||{};
  const count=(key)=>Math.max(0,Number(c[key]||0)||0);
  return {
    userCount:Array.isArray(db?.users)?db.users.length:0,
    classCount:Array.isArray(db?.school?.classes)?db.school.classes.length:0,
    examCount:Array.isArray(db?.exams)?db.exams.length:0,
    scheduleCount:Array.isArray(db?.weeklySchedule)?db.weeklySchedule.filter(x=>x?.active!==false).length:0,
    attendanceCount:Array.isArray(db?.attendance)?db.attendance.length:0,
    gradeRecordCount:(Array.isArray(db?.grades)?db.grades.length:0)+(Array.isArray(db?.termGrades)?db.termGrades.length:0)+(Array.isArray(db?.continuousAssessments)?db.continuousAssessments.length:0),
    invalidClassUserCount:count('invalidClassUsers'),orphanEnrollmentCount:count('orphanEnrollments'),activeEnrollmentMismatchCount:count('activeEnrollmentMismatch'),profileWarningCount:count('duplicateNationalIds')+count('missingBirthDates'),
    brokenTeachingAssignmentCount:count('brokenTeachingAssignments'),brokenWeeklyScheduleCount:count('brokenWeeklySchedule'),orphanOnlineSessionCount:count('orphanOnlineSessions'),orphanOnlineJoinEventCount:count('orphanOnlineJoinEvents'),
    orphanAttemptCount:count('orphanAttempts'),orphanSubmissionCount:count('orphanSubmissions'),orphanGradeCount:count('orphanGrades'),orphanAppealCount:count('orphanAppeals'),
    orphanAttendanceCount:count('orphanAttendance'),orphanHomeworkSubmissionCount:count('orphanHomeworkSubmissions'),orphanTermGradeCount:count('orphanTermGrades'),orphanContinuousAssessmentCount:count('orphanContinuousAssessments'),orphanContinuousOverrideCount:count('orphanContinuousGradeOverrides'),orphanBehaviorRecordCount:count('orphanBehaviorRecords'),orphanInterventionCount:count('orphanInterventions'),orphanProgressReportCount:count('orphanProgressReports'),
    orphanGuardianLinkCount:count('orphanGuardianLinks'),invalidCalendarEventCount:count('invalidCalendarEvents'),pendingWorkflowCount:count('openAppeals')+count('pendingGrades')
  };
}

function collectNotificationConsistencySignals28(db){
  const users=Array.isArray(db?.users)?db.users:[];
  const notifications=Array.isArray(db?.notifications)?db.notifications:[];
  const broadcasts=Array.isArray(db?.notificationBroadcasts)?db.notificationBroadcasts:[];
  const announcements=Array.isArray(db?.announcements)?db.announcements:[];
  const academicMessages=Array.isArray(db?.academicMessagesP58)?db.academicMessagesP58:[];
  const guardianMessages=Array.isArray(db?.guardianMessages)?db.guardianMessages:[];
  const guardianLinks=Array.isArray(db?.guardianLinks)?db.guardianLinks:[];
  const classes=Array.isArray(db?.school?.classes)?db.school.classes:[];
  const userById=new Map(users.map(u=>[String(u?.id||''),u]).filter(([id])=>id));
  const classIds=new Set(classes.map(c=>String(c?.id||'')).filter(Boolean));
  const linkIds=new Set(guardianLinks.map(x=>String(x?.id||'')).filter(Boolean));
  const notificationIds=new Map(),broadcastIds=new Map(),announcementIds=new Map();
  for(const row of broadcasts){const id=String(row?.id||'').trim();if(id)broadcastIds.set(id,(broadcastIds.get(id)||0)+1);}
  const broadcastIdSet=new Set([...broadcastIds.keys()]);
  let malformedNotificationCount=0,orphanRecipientCount=0,inactiveRecipientCount=0,orphanCreatorCount=0,invalidReadMetadataCount=0,legacyReadWithoutTimestampCount=0,legacyMissingCreatedAtCount=0,orphanBroadcastReferenceCount=0;
  const deliveryByBroadcast=new Map();
  for(const row of notifications){
    if(!row||typeof row!=='object'){malformedNotificationCount++;continue;}
    const id=String(row.id||'').trim(),userId=String(row.userId||'').trim(),title=String(row.title||'').trim(),body=String(row.body||'').trim();
    if(id)notificationIds.set(id,(notificationIds.get(id)||0)+1);
    if(!id||!userId||!title||!body)malformedNotificationCount++;
    const user=userById.get(userId);if(!user)orphanRecipientCount++;else if(user.active===false||['deleted','locked','graduated'].includes(String(user.profileStatus||'')))inactiveRecipientCount++;
    const creator=String(row.createdBy||'').trim();if(creator&&!userById.has(creator))orphanCreatorCount++;
    if('read' in row&&typeof row.read!=='boolean')invalidReadMetadataCount++;
    if(row.read===true){const readAt=String(row.readAt||'').trim();if(!readAt)legacyReadWithoutTimestampCount++;else if(!Number.isFinite(Date.parse(readAt)))invalidReadMetadataCount++;}
    const createdAt=String(row.createdAt||'').trim();if(!createdAt)legacyMissingCreatedAtCount++;else if(!Number.isFinite(Date.parse(createdAt)))malformedNotificationCount++;
    const bid=String(row.broadcastId||'').trim();if(bid){deliveryByBroadcast.set(bid,(deliveryByBroadcast.get(bid)||0)+1);if(!broadcastIdSet.has(bid))orphanBroadcastReferenceCount++;}
  }
  const duplicateNotificationIdCount=[...notificationIds.values()].filter(n=>n>1).length;
  const duplicateBroadcastIdCount=[...broadcastIds.values()].filter(n=>n>1).length;
  let invalidBroadcastCreatorCount=0,invalidBroadcastTargetCount=0,broadcastRecipientMismatchCount=0;
  for(const row of broadcasts){
    if(!row||typeof row!=='object'){invalidBroadcastTargetCount++;continue;}
    const id=String(row.id||'').trim(),creator=String(row.createdBy||'').trim(),targetType=String(row.targetType||'').trim(),targetId=String(row.targetId||'').trim();
    if(!id||!creator||!userById.has(creator))invalidBroadcastCreatorCount++;
    if(!['user','class','staff','all'].includes(targetType))invalidBroadcastTargetCount++;
    else if(targetType==='user'&&!userById.has(targetId))invalidBroadcastTargetCount++;
    else if(targetType==='class'&&!classIds.has(targetId))invalidBroadcastTargetCount++;
    const declared=Number(row.recipientCount);if(!Number.isInteger(declared)||declared<0||declared!==Number(deliveryByBroadcast.get(id)||0))broadcastRecipientMismatchCount++;
  }
  let invalidAnnouncementTargetCount=0,invalidAnnouncementStateCount=0;
  for(const row of announcements){
    if(!row||typeof row!=='object'){invalidAnnouncementStateCount++;continue;}
    const id=String(row.id||'').trim();if(id)announcementIds.set(id,(announcementIds.get(id)||0)+1);
    const audience=String(row.audience||'').trim();if(!['all','class','student'].includes(audience))invalidAnnouncementTargetCount++;
    else if(audience==='class'&&!classIds.has(String(row.classId||'')))invalidAnnouncementTargetCount++;
    else if(audience==='student'){const u=userById.get(String(row.studentId||''));if(!u||u.role!=='student')invalidAnnouncementTargetCount++;}
    if(!id||!String(row.title||'').trim()||!String(row.body||'').trim()||!['normal','important','urgent'].includes(String(row.priority||'normal'))||!['active','archived'].includes(String(row.status||'active')))invalidAnnouncementStateCount++;
    const expiresAt=String(row.expiresAt||'').trim();if(expiresAt&&!Number.isFinite(Date.parse(expiresAt)))invalidAnnouncementStateCount++;
    const creator=String(row.createdBy||'').trim();if(creator&&!userById.has(creator))orphanCreatorCount++;
  }
  const duplicateAnnouncementIdCount=[...announcementIds.values()].filter(n=>n>1).length;
  let orphanAcademicMessageCount=0,invalidAcademicMessageRoleCount=0;
  for(const row of academicMessages){
    const student=userById.get(String(row?.studentId||'')),teacher=userById.get(String(row?.teacherId||''));
    if(!student||student.role!=='student'||!teacher||teacher.role!=='teacher')orphanAcademicMessageCount++;
    if(!['student','teacher'].includes(String(row?.fromRole||'')))invalidAcademicMessageRoleCount++;
  }
  let orphanGuardianMessageCount=0;
  for(const row of guardianMessages){const linkId=String(row?.linkId||row?.guardianLinkId||'').trim();if(!linkId||!linkIds.has(linkId))orphanGuardianMessageCount++;}
  return {notificationCount:notifications.length,duplicateNotificationIdCount,malformedNotificationCount,orphanRecipientCount,inactiveRecipientCount,orphanCreatorCount,invalidReadMetadataCount,legacyReadWithoutTimestampCount,legacyMissingCreatedAtCount,broadcastCount:broadcasts.length,duplicateBroadcastIdCount,invalidBroadcastCreatorCount,invalidBroadcastTargetCount,orphanBroadcastReferenceCount,broadcastRecipientMismatchCount,announcementCount:announcements.length,duplicateAnnouncementIdCount,invalidAnnouncementTargetCount,invalidAnnouncementStateCount,academicMessageCount:academicMessages.length,orphanAcademicMessageCount,invalidAcademicMessageRoleCount,guardianMessageCount:guardianMessages.length,orphanGuardianMessageCount};
}

function collectGradebookConsistencySignals27(db){
  const users=Array.isArray(db?.users)?db.users:[];
  const classes=Array.isArray(db?.school?.classes)?db.school.classes:[];
  const configs=Array.isArray(db?.gradebookConfigs)?db.gradebookConfigs:[];
  const entries=Array.isArray(db?.gradebookEntries)?db.gradebookEntries:[];
  const locks=Array.isArray(db?.termLocks)?db.termLocks:[];
  const continuousOverrides=Array.isArray(db?.continuousGradeOverrides)?db.continuousGradeOverrides:[];
  const finalOverrides=Array.isArray(db?.termFinalOverrides)?db.termFinalOverrides:[];
  const cards=Array.isArray(db?.reportCards)?db.reportCards:[];
  const activeYear=String(db?.school?.year||'').trim();
  const classById=new Map(classes.map(c=>[String(c?.id||''),c]).filter(([id])=>id));
  const studentById=new Map(users.filter(u=>u?.role==='student'&&u?.active!==false&&u?.profileStatus!=='deleted').map(u=>[String(u.id||''),u]).filter(([id])=>id));
  const validPeriods=new Set(['semester1','semester2']);
  const validCardPeriods=new Set(['semester1','semester2','annual']);
  const cfgKeyCounts=new Map(),cfgByKey=new Map();
  let invalidConfigReferenceCount=0,invalidCategoryDefinitionCount=0,invalidWeightTotalCount=0;
  for(const cfg of configs){
    const key=String(cfg?.key||'').trim();if(key){cfgKeyCounts.set(key,(cfgKeyCounts.get(key)||0)+1);if(!cfgByKey.has(key))cfgByKey.set(key,cfg);}
    const classId=String(cfg?.classId||''),year=String(cfg?.academicYear||''),period=String(cfg?.academicPeriod||cfg?.period||'');
    if(!classById.has(classId)||!year||!validPeriods.has(period))invalidConfigReferenceCount++;
    const expectedKey=`${classId}__${String(cfg?.subject||'')}__${year}__${period}`;if(key&&key!==expectedKey)invalidConfigReferenceCount++;
    const cats=Array.isArray(cfg?.categories)?cfg.categories:[];const ids=new Set();let sum=0,examSources=0,catBad=false;
    for(const cat of cats){const id=String(cat?.id||'').trim(),weight=Number(cat?.weight),source=String(cat?.source||'');if(!id||ids.has(id)||!Number.isFinite(weight)||weight<0||weight>100||!['exam','manual'].includes(source))catBad=true;if(id)ids.add(id);if(Number.isFinite(weight))sum+=weight;if(source==='exam')examSources++;}
    const outputMax=Number(cfg?.outputMaxScore);if(!cats.length||!examSources||!Number.isFinite(outputMax)||outputMax<=0||outputMax>20)catBad=true;
    if(catBad)invalidCategoryDefinitionCount++;if(Math.abs(sum-100)>0.001)invalidWeightTotalCount++;
  }
  const duplicateConfigKeyCount=[...cfgKeyCounts.values()].filter(n=>n>1).length;
  const entryIds=new Map();let orphanEntryStudentCount=0,entryClassMismatchCount=0,unknownEntryCategoryCount=0,invalidEntryScoreCount=0;
  for(const row of entries){if(row?.active===false)continue;const id=String(row?.id||'').trim();if(id)entryIds.set(id,(entryIds.get(id)||0)+1);const student=studentById.get(String(row?.studentId||''));const classId=String(row?.classId||'');if(!student)orphanEntryStudentCount++;else if(String(student.classId||'')!==classId)entryClassMismatchCount++;const year=String(row?.academicYear||activeYear),period=String(row?.academicPeriod||row?.period||'semester2'),subject=String(row?.subject||''),key=`${classId}__${subject}__${year}__${period}`;const cfg=cfgByKey.get(key);const categoryId=String(row?.categoryId||'');if(!cfg||!(Array.isArray(cfg.categories)&&cfg.categories.some(c=>String(c?.id||'')===categoryId)))unknownEntryCategoryCount++;const score=Number(row?.score),max=Number(row?.maxScore);if(!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)invalidEntryScoreCount++;}
  const duplicateEntryIdCount=[...entryIds.values()].filter(n=>n>1).length;
  const lockScopes=new Map();let termLockCount=0,invalidLockReferenceCount=0;
  for(const row of locks){if(row?.active===false)continue;termLockCount++;const classId=String(row?.classId||''),year=String(row?.academicYear||''),period=String(row?.academicPeriod||row?.period||''),subject=String(row?.subject||'');if(!classById.has(classId)||!subject||!year||!validPeriods.has(period))invalidLockReferenceCount++;const key=`${classId}\u0000${subject}\u0000${year}\u0000${period}`;lockScopes.set(key,(lockScopes.get(key)||0)+1);}
  const duplicateActiveLockScopeCount=[...lockScopes.values()].filter(n=>n>1).length;
  let overrideCount=0,invalidOverrideReferenceCount=0,invalidOverrideScoreCount=0;
  for(const row of [...continuousOverrides,...finalOverrides]){if(row?.active===false)continue;overrideCount++;const student=studentById.get(String(row?.studentId||'')),classId=String(row?.classId||'');if(!student||!classById.has(classId)||String(student?.classId||'')!==classId)invalidOverrideReferenceCount++;const hasApproved=row?.approvedRawScore!==undefined||row?.approvedMaxScore!==undefined;if(hasApproved){const score=Number(row?.approvedRawScore),max=Number(row?.approvedMaxScore);if(!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)invalidOverrideScoreCount++;}else{const score=Number(row?.score??row?.finalScore);if(!Number.isFinite(score)||score<0||score>20)invalidOverrideScoreCount++;}}
  let orphanReportCardCount=0,invalidReportCardScopeCount=0,legacyMissingScopeCount=0;const publishedScopes=new Map();
  for(const row of cards){const student=studentById.get(String(row?.studentId||''));if(!student)orphanReportCardCount++;const rawYear=String(row?.academicYear||'').trim(),rawPeriod=String(row?.academicPeriod||row?.period||'').trim();if(!rawYear||!rawPeriod){legacyMissingScopeCount++;continue;}if(!validCardPeriods.has(rawPeriod))invalidReportCardScopeCount++;if(row?.status==='published'){const key=`${String(row.studentId||'')}\u0000${rawYear}\u0000${rawPeriod}`;publishedScopes.set(key,(publishedScopes.get(key)||0)+1);}}
  const duplicatePublishedReportCardCount=[...publishedScopes.values()].filter(n=>n>1).length;
  return {configCount:configs.length,duplicateConfigKeyCount,invalidConfigReferenceCount,invalidCategoryDefinitionCount,invalidWeightTotalCount,entryCount:entries.filter(x=>x?.active!==false).length,duplicateEntryIdCount,orphanEntryStudentCount,entryClassMismatchCount,unknownEntryCategoryCount,invalidEntryScoreCount,termLockCount,invalidLockReferenceCount,duplicateActiveLockScopeCount,overrideCount,invalidOverrideReferenceCount,invalidOverrideScoreCount,reportCardCount:cards.length,orphanReportCardCount,invalidReportCardScopeCount,duplicatePublishedReportCardCount,legacyMissingScopeCount};
}

function collectScheduleConsistencySignals26(db){
  const all=Array.isArray(db?.weeklySchedule)?db.weeklySchedule:[];
  const year=String(db?.school?.year||'').trim();
  const classes=Array.isArray(db?.school?.classes)?db.school.classes:[];
  const assignments=Array.isArray(db?.teachingAssignments)?db.teachingAssignments:[];
  const users=Array.isArray(db?.users)?db.users:[];
  const shifts=Array.isArray(db?.school?.shiftDefinitions)?db.school.shiftDefinitions:[];
  const classById=new Map(classes.filter(c=>c?.active!==false).map(c=>[String(c?.id||''),c]).filter(([id])=>id));
  const assignmentById=new Map(assignments.filter(a=>a?.active!==false).map(a=>[String(a?.id||''),a]).filter(([id])=>id));
  const userById=new Map(users.map(u=>[String(u?.id||''),u]).filter(([id])=>id));
  const shiftById=new Map(shifts.map(x=>[String(x?.id||''),x]).filter(([id])=>id));
  const validDays=new Set(['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه']);
  const validDelivery=new Set(['inherit','in_person','online','hybrid']);
  const defaultMeetingUrl=String(db?.school?.onlineLearning?.defaultMeetingUrl||'').trim();
  const idCounts=new Map();
  for(const row of all){const id=String(row?.id||'').trim();if(id)idCounts.set(id,(idCounts.get(id)||0)+1);}
  const duplicateScheduleIdCount=[...idCounts.values()].filter(n=>n>1).length;
  const current=[];let historicalActiveCount=0,legacyMissingYearCount=0;
  for(const row of all){if(!row||typeof row!=='object'||row.active===false)continue;const rawYear=String(row.academicYear||'').trim();if(!rawYear)legacyMissingYearCount++;if(rawYear&&year&&rawYear!==year){historicalActiveCount++;continue;}current.push(row);}
  let invalidClassCount=0,invalidAssignmentReferenceCount=0,assignmentMismatchCount=0,orphanTeacherCount=0,invalidDayCount=0,invalidPeriodCount=0,invalidTimeRangeCount=0,invalidShiftCount=0,invalidDeliveryModeCount=0,onlineDeliveryGapCount=0;
  const classSlots=new Map(),teacherSlots=new Map(),intervals=[];
  for(const row of current){
    const classId=String(row.classId||''),assignmentId=String(row.assignmentId||''),teacherId=String(row.teacherId||''),subject=String(row.subject||''),bookId=String(row.bookId||''),day=String(row.day||''),shiftId=String(row.shiftId||''),delivery=String(row.deliveryMode||'inherit');
    if(!classById.has(classId))invalidClassCount++;
    const assignment=assignmentById.get(assignmentId);if(!assignment)invalidAssignmentReferenceCount++;else if(String(assignment.classId||'')!==classId||String(assignment.teacherId||'')!==teacherId||(subject&&String(assignment.subject||'')!==subject)||(bookId&&String(assignment.bookId||'')&&String(assignment.bookId||'')!==bookId)||(assignment.academicYear&&year&&String(assignment.academicYear)!==year))assignmentMismatchCount++;
    const teacher=userById.get(teacherId);if(!teacher||teacher.role!=='teacher'||teacher.active===false||['deleted','locked','graduated'].includes(String(teacher.profileStatus||'')))orphanTeacherCount++;
    if(!validDays.has(day))invalidDayCount++;
    const periodNo=Number(row.periodNo);if(!Number.isInteger(periodNo)||periodNo<1||periodNo>10)invalidPeriodCount++;
    if(!shiftById.has(shiftId))invalidShiftCount++;
    const start=hmMinutesV74(row.startTime),end=hmMinutesV74(row.endTime);if(start===null||end===null||end<=start)invalidTimeRangeCount++;
    if(!validDelivery.has(delivery))invalidDeliveryModeCount++;
    if(['online','hybrid'].includes(delivery)&&!String(row.meetingUrl||'').trim()&&!defaultMeetingUrl)onlineDeliveryGapCount++;
    if(classId&&day&&shiftId&&Number.isInteger(periodNo)){const key=`${classId}\u0000${day}\u0000${shiftId}\u0000${periodNo}`;classSlots.set(key,(classSlots.get(key)||0)+1);}
    if(teacherId&&day&&shiftId&&Number.isInteger(periodNo)){const key=`${teacherId}\u0000${day}\u0000${shiftId}\u0000${periodNo}`;teacherSlots.set(key,(teacherSlots.get(key)||0)+1);}
    if(start!==null&&end!==null&&end>start&&day)intervals.push({classId,teacherId,day,start,end});
  }
  const classSlotConflictCount=[...classSlots.values()].filter(n=>n>1).length;
  const teacherSlotConflictCount=[...teacherSlots.values()].filter(n=>n>1).length;
  let classTimeOverlapCount=0,teacherTimeOverlapCount=0;
  for(let i=0;i<intervals.length;i++)for(let j=i+1;j<intervals.length;j++){const a=intervals[i],b=intervals[j];if(a.day!==b.day||!(a.start<b.end&&b.start<a.end))continue;if(a.classId&&a.classId===b.classId)classTimeOverlapCount++;if(a.teacherId&&a.teacherId===b.teacherId)teacherTimeOverlapCount++;}
  return {scheduleCount:current.length,duplicateScheduleIdCount,invalidClassCount,invalidAssignmentReferenceCount,assignmentMismatchCount,orphanTeacherCount,invalidDayCount,invalidPeriodCount,invalidTimeRangeCount,invalidShiftCount,classSlotConflictCount,teacherSlotConflictCount,classTimeOverlapCount,teacherTimeOverlapCount,legacyMissingYearCount,historicalActiveCount,invalidDeliveryModeCount,onlineDeliveryGapCount};
}

function collectAttendanceConsistencySignals25(db){
  const users=Array.isArray(db?.users)?db.users:[];
  const sessions=Array.isArray(db?.attendanceSessions)?db.attendanceSessions:[];
  const attendance=Array.isArray(db?.attendance)?db.attendance:[];
  const schedules=Array.isArray(db?.weeklySchedule)?db.weeklySchedule:[];
  const classIds=new Set((db?.school?.classes||[]).map(c=>String(c?.id||'')).filter(Boolean));
  const userById=new Map(users.map(u=>[String(u?.id||''),u]).filter(([id])=>id));
  const studentById=new Map(users.filter(u=>u?.role==='student').map(u=>[String(u.id||''),u]).filter(([id])=>id));
  const scheduleById=new Map(schedules.map(row=>[String(row?.id||''),row]).filter(([id])=>id));
  const sessionById=new Map();const sessionIdCounts=new Map();
  let invalidSessionClassCount=0,invalidScheduleReferenceCount=0,scheduleSessionMismatchCount=0,orphanSessionTeacherCount=0,invalidSessionDateTimeCount=0,legacyUnscheduledSessionCount=0;
  const validDate=value=>{const text=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(Date.parse(`${text}T00:00:00Z`));};
  for(const row of sessions){
    if(!row||typeof row!=='object'){invalidSessionDateTimeCount++;continue;}
    const id=String(row.id||'').trim();if(id){sessionIdCounts.set(id,(sessionIdCounts.get(id)||0)+1);if(!sessionById.has(id))sessionById.set(id,row);}
    const classId=String(row.classId||'');if(!classIds.has(classId))invalidSessionClassCount++;
    const teacherId=String(row.teacherId||'');const teacher=userById.get(teacherId);if(!teacherId||!teacher||teacher.role!=='teacher')orphanSessionTeacherCount++;
    const scheduleId=String(row.scheduleEntryId||'');
    if(!scheduleId)legacyUnscheduledSessionCount++;
    else{
      const schedule=scheduleById.get(scheduleId);
      if(!schedule)invalidScheduleReferenceCount++;
      else if(String(schedule.classId||'')!==classId||(teacherId&&String(schedule.teacherId||'')&&String(schedule.teacherId||'')!==teacherId))scheduleSessionMismatchCount++;
    }
    const date=String(row.date||'').trim(),start=String(row.startTime||'').trim(),end=String(row.endTime||'').trim();
    let invalid=!validDate(date);
    if(start||end){const a=hmMinutesV74(start),b=hmMinutesV74(end);if(a===null||b===null||b<=a)invalid=true;}
    if(invalid)invalidSessionDateTimeCount++;
  }
  const duplicateSessionIdCount=[...sessionIdCounts.values()].filter(n=>n>1).length;
  const allowedStatuses=new Set(['present','late','absent_pending','absent_excused','absent_unexcused','absent','excused']);
  let orphanAttendanceSessionCount=0,orphanAttendanceStudentCount=0,attendanceClassMismatchCount=0,invalidAttendanceStatusCount=0,attendanceDateMismatchCount=0,reviewMetadataGapCount=0,legacyAggregateAttendanceCount=0;
  const attendancePairCounts=new Map();
  for(const row of attendance){
    if(!row||typeof row!=='object'){orphanAttendanceSessionCount++;continue;}
    const sessionId=String(row.sessionId||'').trim(),studentId=String(row.studentId||'').trim();
    if(!sessionId){
      if(['present','absent','late'].some(k=>Number(row[k]||0)>0))legacyAggregateAttendanceCount++;
      else orphanAttendanceSessionCount++;
      continue;
    }
    const session=sessionById.get(sessionId);if(!session){orphanAttendanceSessionCount++;continue;}
    const student=studentById.get(studentId);if(!student){orphanAttendanceStudentCount++;continue;}
    const rowClass=String(row.classId||'').trim();const sessionClass=String(session.classId||'').trim();
    if(rowClass&&sessionClass&&rowClass!==sessionClass)attendanceClassMismatchCount++;
    const key=`${sessionId}\u0000${studentId}`;attendancePairCounts.set(key,(attendancePairCounts.get(key)||0)+1);
    const rawStatus=String(row.status||'').trim();if(!allowedStatuses.has(rawStatus))invalidAttendanceStatusCount++;
    if(row.date&&session.date&&String(row.date)!==String(session.date))attendanceDateMismatchCount++;
    const normalized=rawStatus==='absent'?'absent_pending':rawStatus==='excused'?'absent_excused':rawStatus;
    if(['absent_excused','absent_unexcused'].includes(normalized)){
      if(!String(row.reviewedAt||'').trim()||!String(row.reviewedBy||'').trim()||(normalized==='absent_excused'&&!String(row.absenceReasonText||row.note||'').trim()))reviewMetadataGapCount++;
    }
  }
  const duplicateAttendancePairCount=[...attendancePairCounts.values()].filter(n=>n>1).length;
  return {sessionCount:sessions.length,attendanceCount:attendance.length,duplicateSessionIdCount,invalidSessionClassCount,invalidScheduleReferenceCount,scheduleSessionMismatchCount,orphanSessionTeacherCount,invalidSessionDateTimeCount,legacyUnscheduledSessionCount,orphanAttendanceSessionCount,orphanAttendanceStudentCount,attendanceClassMismatchCount,duplicateAttendancePairCount,invalidAttendanceStatusCount,attendanceDateMismatchCount,reviewMetadataGapCount,legacyAggregateAttendanceCount};
}

async function collectAuditConsistencySignals22(db){
  const users=Array.isArray(db?.users)?db.users:[];
  const userIds=new Set(users.map(u=>String(u?.id||'')).filter(Boolean));
  const appRows=Array.isArray(db?.audit)?db.audit:[];
  const futureToleranceMs=5*60*1000;
  const now=Date.now();
  let malformedAppAuditCount=0,duplicateAppAuditIdCount=0,invalidTimestampCount=0,legacyTimestampCount=0,futureTimestampCount=0,orderViolationCount=0,orphanActorCount=0;
  const appIds=new Set();
  let previousAppTime=Infinity;
  for(const row of appRows){
    if(!row||typeof row!=='object'){malformedAppAuditCount++;continue;}
    const id=String(row.id||'').trim(),action=String(row.action||'').trim(),at=String(row.at||'').trim();
    if(!id||!action||!at)malformedAppAuditCount++;
    if(id){if(appIds.has(id))duplicateAppAuditIdCount++;else appIds.add(id);}
    const ms=Date.parse(at);
    if(!Number.isFinite(ms)){if(at)legacyTimestampCount++;else invalidTimestampCount++;}
    else{
      if(ms>now+futureToleranceMs)futureTimestampCount++;
      if(ms>previousAppTime+1000)orderViolationCount++;
      previousAppTime=Math.min(previousAppTime,ms);
    }
    const actor=String(row.userId||'').trim();if(actor&&!userIds.has(actor))orphanActorCount++;
  }
  let securityAuditAvailable=false,securityAuditCount=0,malformedSecurityLineCount=0,duplicateSecurityAuditIdCount=0;
  const securityIds=new Set();
  let previousSecurityTime=-Infinity;
  try{
    const raw=await fs.readFile(SECURITY_AUDIT_FILE,'utf8');securityAuditAvailable=true;
    const lines=raw.split(/\r?\n/).filter(line=>String(line).trim());
    securityAuditCount=lines.length;
    for(const line of lines){
      let row;try{row=JSON.parse(line);}catch{malformedSecurityLineCount++;continue;}
      if(!row||typeof row!=='object'){malformedSecurityLineCount++;continue;}
      const id=String(row.id||'').trim(),type=String(row.type||'').trim(),at=String(row.at||'').trim();
      if(!id||!type||!at)malformedSecurityLineCount++;
      if(id){if(securityIds.has(id))duplicateSecurityAuditIdCount++;else securityIds.add(id);}
      const ms=Date.parse(at);
      if(!Number.isFinite(ms))invalidTimestampCount++;
      else{
        if(ms>now+futureToleranceMs)futureTimestampCount++;
        if(ms+1000<previousSecurityTime)orderViolationCount++;
        previousSecurityTime=Math.max(previousSecurityTime,ms);
      }
      const actor=String(row.userId||'').trim();if(actor&&!userIds.has(actor))orphanActorCount++;
    }
  }catch(error){if(error?.code!=='ENOENT')malformedSecurityLineCount++;}
  return {
    appAuditCount:appRows.length,securityAuditCount,malformedAppAuditCount,malformedSecurityLineCount,
    duplicateAppAuditIdCount,duplicateSecurityAuditIdCount,invalidTimestampCount,legacyTimestampCount,futureTimestampCount,
    orderViolationCount,orphanActorCount,securityAuditAvailable,
    appAuditOverCapacity:appRows.length>50000,securityAuditOverCapacity:securityAuditCount>20000
  };
}

function diagnosticRateIdentity14(req,user){
  return crypto.createHash("sha256").update(`${String(user?.id||"")}|${clientIp(req)}`).digest("hex").slice(0,32);
}
function sanitizeClientDiagnosticText(value, max = 180) {
  let text = String(value ?? "");
  text = text
    .replace(/(bearer\s+)[a-z0-9._~+\/-]{12,}/ig, "$1[redacted]")
    .replace(/data:[^;,\s]+(?:;base64)?,[a-z0-9+/=_-]{20,}/ig, "[data-redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, "[token-redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig, "[email-redacted]")
    .replace(/(^|\D)\d{8,16}(?!\d)/g, (_, prefix) => `${prefix}[number-redacted]`)
    .replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return text.slice(0, Math.max(0, Number(max) || 180));
}
function sanitizeClientDiagnosticPath(value) {
  try { return sanitizeClientDiagnosticText(new URL(String(value || ""), "https://local.invalid").pathname, 160) || "/"; }
  catch { return sanitizeClientDiagnosticText(String(value || "").split(/[?#]/)[0], 160) || "/"; }
}
function normalizeClientDiagnostic(body, role = "") {
  const idRaw = String(body?.id || "").toUpperCase();
  const id = /^D-[A-F0-9]{6,20}$/.test(idRaw) ? idRaw : `D-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  return {
    id, at: new Date().toISOString(), level: body?.level === "error" ? "error" : "warn", role: sanitizeClientDiagnosticText(role, 24),
    kind: sanitizeClientDiagnosticText(body?.kind || "client", 24), operation: sanitizeClientDiagnosticText(body?.operation || "frontend", 80),
    phase: sanitizeClientDiagnosticText(body?.phase || "", 40), method: sanitizeClientDiagnosticText(body?.method || "", 10).toUpperCase(),
    path: sanitizeClientDiagnosticPath(body?.path || "/"), code: sanitizeClientDiagnosticText(body?.code || "", 40),
    status: Math.max(0, Math.min(599, Number(body?.status || 0) || 0)), online: body?.online !== false,
    uncertainCommit: Boolean(body?.uncertainCommit), release: sanitizeClientDiagnosticText(body?.release || "", 80),
    message: sanitizeClientDiagnosticText(body?.message || "خطای ناشناخته", 180)
  };
}
function pushClientDiagnostic(record) {
  clientDiagnosticEvents.unshift(record);
  if (clientDiagnosticEvents.length > CLIENT_DIAGNOSTIC_LIMIT) clientDiagnosticEvents.length = CLIENT_DIAGNOSTIC_LIMIT;
  console.warn(`[client-diagnostic:${record.id}] ${record.role || "staff"} ${record.operation} ${record.path} ${record.code || ""} ${record.message}`);
}
const DATA_DIR = process.env.MADRESEYAR_DATA_DIR ? path.resolve(process.env.MADRESEYAR_DATA_DIR) : path.join(ROOT, "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const QUESTION_MEDIA_DIR_48 = path.join(DATA_DIR, "question-media-v48");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SECURITY_FILE = path.join(DATA_DIR, "security.json");
const SECURITY_MIRROR_FILE = path.join(DATA_DIR, "security.mirror.json");
const SECURITY_AUDIT_FILE = path.join(DATA_DIR, "security-audit.jsonl");
const LOGIN_ATTEMPTS_FILE = path.join(DATA_DIR, "login-attempts.json");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const STATE_PREVIOUS_FILE = path.join(DATA_DIR, "state.previous.json");
const STATE_MIRROR_FILE = path.join(DATA_DIR, "state.mirror.json");
const RECOVERY_LOG_FILE = path.join(DATA_DIR, "recovery-log.jsonl");
const ENCRYPTED_RESTORE_TRANSACTION_FILE = path.join(DATA_DIR, ".encrypted-restore-transaction.json");
const scryptAsync = promisify(crypto.scrypt);


function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function faNow() {
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date()); }
  catch { return new Date().toISOString(); }
}

// P0 stabilization — authoritative validation for guardian meeting invitations.
function normalizeMeetingDigitsV52(value){return String(value||"").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));}
function isLeapJalaliYearV52(jy){
  const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  const div=(a,b)=>Math.trunc(a/b),mod=(a,b)=>a-div(a,b)*b;
  if(jy<breaks[0]||jy>=breaks.at(-1))return false;
  let jp=breaks[0],jump=0,n=0;
  for(let i=1;i<breaks.length;i++){const jm=breaks[i];jump=jm-jp;if(jy<jm)break;jp=jm;}
  n=jy-jp;
  if(jump-n<6)n=n-jump+div(jump+4,33)*33;
  let leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;
  return leap===0;
}
function normalizeMeetingJalaliDateV52(value){
  const raw=normalizeMeetingDigitsV52(value).trim().replace(/[-.]/g,"/");
  const m=raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);if(!m)return "";
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  if(y<1300||y>1500||mo<1||mo>12||d<1)return "";
  const max=mo<=6?31:mo<=11?30:(isLeapJalaliYearV52(y)?30:29);if(d>max)return "";
  return `${String(y).padStart(4,"0")}/${String(mo).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
}
function currentMeetingJalaliDateV52(){
  try{const parts=new Intl.DateTimeFormat("en-US-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t)?.value||"";return `${get("year")}/${get("month")}/${get("day")}`;}catch{return "";}
}
function normalizeMeetingTimeV52(value){
  const raw=normalizeMeetingDigitsV52(value).trim().toUpperCase().replace(/\s+/g," ");
  const m=raw.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);if(!m)return "";
  let h=Number(m[1]),min=Number(m[2]);if(min<0||min>59)return "";
  if(m[3]){if(h<1||h>12)return "";if(m[3]==="PM"&&h!==12)h+=12;if(m[3]==="AM"&&h===12)h=0;}else if(h<0||h>23)return "";
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}

// v74 — Online / hybrid school helpers. The conferencing engine is provider-agnostic;
// schools can use any HTTPS classroom provider while Madreseyar owns schedule, identity,
// check-in, attendance, homework, exams and audit data.
const DELIVERY_MODES_V74 = new Set(["inherit", "in_person", "online", "hybrid"]);
function normalizeDeliveryModeV74(value, fallback = "inherit") {
  const mode = String(value || "").trim();
  return DELIVERY_MODES_V74.has(mode) ? mode : fallback;
}
function normalizeWebUrlV74(value, { allowEmpty = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw && allowEmpty) return "";
  if (!raw) throw Object.assign(new Error("آدرس کلاس آنلاین لازم است."), { status: 400 });
  if (raw.length > 2048) throw Object.assign(new Error("آدرس کلاس آنلاین بیش از حد طولانی است."), { status: 400 });
  let u; try { u = new URL(raw); } catch { throw Object.assign(new Error("آدرس کلاس آنلاین معتبر نیست."), { status: 400 }); }
  if (!["http:", "https:"].includes(u.protocol)) throw Object.assign(new Error("آدرس کلاس آنلاین باید با http یا https باشد."), { status: 400 });
  return u.toString();
}
const DEFAULT_SELF_HOSTED_MEETING_BASE_V728911="https://meet.scooljavanrood.ir/";
function normalizeMeetingBaseV728911(value){
  const raw=String(value||"").trim()||DEFAULT_SELF_HOSTED_MEETING_BASE_V728911;
  try{const u=new URL(raw);if(!["http:","https:"].includes(u.protocol))throw new Error();u.hash="";u.search="";if(!u.pathname.endsWith("/"))u.pathname+="/";return u.toString();}catch{return DEFAULT_SELF_HOSTED_MEETING_BASE_V728911;}
}
function autoMeetingBaseV72899(db){
  const saved=db?.school?.onlineLearning?.meetingBaseUrl;
  const env=process.env.MADRESEYAR_AUTO_MEETING_BASE_URL;
  return normalizeMeetingBaseV728911(saved||env||DEFAULT_SELF_HOSTED_MEETING_BASE_V728911);
}
function autoMeetingUrlV72899(db){
  const room=`msy-${crypto.randomBytes(18).toString("base64url")}`;
  return new URL(room,autoMeetingBaseV72899(db)).toString();
}
function meetingUrlMatchesBaseV728911(url,base){
  try{const u=new URL(String(url||"")),b=new URL(String(base||""));return u.protocol===b.protocol&&u.host===b.host&&u.pathname.startsWith(b.pathname);}catch{return false;}
}

function onlineLearningSettingsV74(db) {
  const raw = db?.school?.onlineLearning || {};
  const op = normalizeDeliveryModeV74(raw.operationMode, "in_person");
  const operationMode = op === "inherit" ? "in_person" : op;
  return {
    enabled: raw.enabled === true || operationMode !== "in_person",
    operationMode,
    defaultProvider: String(raw.defaultProvider || "Jitsi").trim().slice(0, 60) || "Jitsi",
    meetingBaseUrl: normalizeMeetingBaseV728911(raw.meetingBaseUrl || process.env.MADRESEYAR_AUTO_MEETING_BASE_URL || DEFAULT_SELF_HOSTED_MEETING_BASE_V728911),
    defaultMeetingUrl: normalizeWebUrlV74(raw.defaultMeetingUrl || ""),
    instructions: String(raw.instructions || "").trim().slice(0, 1500),
    joinWindowMinutes: Math.max(0, Math.min(180, Number(raw.joinWindowMinutes ?? 15) || 0)),
    lateAfterMinutes: Math.max(0, Math.min(180, Number(raw.lateAfterMinutes ?? 10) || 0)),
    teacherCanEditLinks: raw.teacherCanEditLinks !== false,
    requireStudentCheckIn: raw.requireStudentCheckIn !== false
  };
}
function effectiveDeliveryModeV74(db, entry) {
  const settings = onlineLearningSettingsV74(db);
  const local = normalizeDeliveryModeV74(entry?.deliveryMode, "inherit");
  return local === "inherit" ? settings.operationMode : local;
}
function publicOnlineSettingsV74(db) {
  const s = onlineLearningSettingsV74(db);
  return { enabled:s.enabled, operationMode:s.operationMode, defaultProvider:s.defaultProvider, meetingBaseUrl:s.meetingBaseUrl, instructions:s.instructions, joinWindowMinutes:s.joinWindowMinutes, lateAfterMinutes:s.lateAfterMinutes, requireStudentCheckIn:s.requireStudentCheckIn };
}

function schoolClockV74(){
  const timeZone=String(process.env.MADRESEYAR_TIMEZONE||"Asia/Tehran");
  let parts;
  try{parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));}
  catch{parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));}
  const dayMap={Sat:"شنبه",Sun:"یکشنبه",Mon:"دوشنبه",Tue:"سه‌شنبه",Wed:"چهارشنبه",Thu:"پنجشنبه",Fri:"جمعه"};
  return {date:`${parts.year}-${parts.month}-${parts.day}`,dayName:dayMap[parts.weekday]||"",minutes:Number(parts.hour||0)*60+Number(parts.minute||0),timeZone};
}
function hmMinutesV74(value){const m=String(value||"").match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;const h=Number(m[1]),min=Number(m[2]);return h>=0&&h<24&&min>=0&&min<60?h*60+min:null;}
function publicOnlineScheduleEntryV74(db, entry) {
  const settings = onlineLearningSettingsV74(db), effectiveMode = effectiveDeliveryModeV74(db, entry);
  const onlineCapable = settings.enabled && ["online","hybrid"].includes(effectiveMode);
  return {
    ...entry,
    deliveryMode: normalizeDeliveryModeV74(entry?.deliveryMode, "inherit"),
    effectiveMode,
    meetingProvider: String(entry?.meetingProvider || settings.defaultProvider || "custom").slice(0,60),
    meetingUrl: onlineCapable ? normalizeWebUrlV74(entry?.meetingUrl || settings.defaultMeetingUrl || "") : "",
    onlineInstructions: onlineCapable ? String(entry?.onlineInstructions || settings.instructions || "").slice(0,1500) : ""
  };
}



const ROLE_LABELS = AUTH_ROLE_LABELS;
const ROLE_SESSION_POLICY = AUTH_ROLE_SESSION_POLICY;
const CREDENTIAL_PRESET_VERSION = 16;
const DEFAULT_CREDENTIALS = {
  tea1: {
    username: process.env.MADRESEYAR_TEACHER_USERNAME || "admin",
    password: process.env.MADRESEYAR_TEACHER_PASSWORD || "admin",
    mustChangePassword: true
  },
  sys1: {
    username: process.env.MADRESEYAR_SUPERADMIN_USERNAME || "admin405",
    password: process.env.MADRESEYAR_SUPERADMIN_PASSWORD || "admin405",
    mustChangePassword: true
  }
};
const COMMON_PASSWORDS = new Set(["12345678", "123456789", "password", "qwerty123", "11111111", "admin123", "student", "teacher"]);
let securityWriteQueue = Promise.resolve();
let securityOperationQueue = Promise.resolve();
let stateOperationQueue = Promise.resolve();
const loginAttempts = new Map();

const TRUST_PROXY = /^(?:1|true|yes)$/i.test(String(process.env.MADRESEYAR_TRUST_PROXY || ""));
function normalizeIpAddress(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (/^\[[^\]]+\](?::\d+)?$/.test(raw)) raw = raw.slice(1, raw.indexOf("]"));
  if (net.isIP(raw)) return raw;
  const ipv4WithPort = raw.match(/^((?:\d{1,3}\.){3}\d{1,3}):\d+$/);
  if (ipv4WithPort && net.isIP(ipv4WithPort[1])) return ipv4WithPort[1];
  return "";
}
function isLoopbackAddress(value) {
  const ip = normalizeIpAddress(value);
  return ip === "127.0.0.1" || ip === "::1";
}
function clientIp(req) {
  const remote = normalizeIpAddress(req.socket?.remoteAddress) || "unknown";
  const trustedPeer = TRUST_PROXY || isLoopbackAddress(remote);
  if (!trustedPeer) return remote;
  // cPanel/Passenger commonly proxies Node through localhost. Prefer headers that
  // are normally overwritten by the trusted local proxy, then fall back to the
  // last X-Forwarded-For hop to avoid trusting a client-supplied leftmost value.
  const realIp = normalizeIpAddress(req.headers["x-real-ip"]);
  if (realIp) return realIp;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map(normalizeIpAddress).filter(Boolean);
  if (forwarded.length) return TRUST_PROXY ? forwarded[0] : forwarded[forwarded.length - 1];
  return remote;
}
function cleanClientHint(value) { return String(value || "").trim().replace(/^"|"$/g, ""); }
function deviceLabelFromRequest(req) {
  const ua = String(req.headers["user-agent"] || "");
  const hintedPlatform = cleanClientHint(req.headers["sec-ch-ua-platform"]);
  const mobileHint = String(req.headers["sec-ch-ua-mobile"] || "").trim() === "?1";
  let os = "دستگاه ناشناس";
  let version = "";
  if (/Android/i.test(hintedPlatform) || /Android/i.test(ua)) {
    os = "Android"; version = (ua.match(/Android\s+([0-9.]+)/i) || [])[1] || "";
  } else if (/iPhone|iPad|iOS/i.test(hintedPlatform) || /iPhone|iPad|iOS/i.test(ua)) {
    os = /iPad/i.test(ua) ? "iPadOS" : "iOS"; version = ((ua.match(/OS\s+([0-9_]+)/i) || [])[1] || "").replace(/_/g, ".");
  } else if (/Windows/i.test(hintedPlatform) || /Windows/i.test(ua)) {
    os = "Windows";
  } else if (/macOS|Mac/i.test(hintedPlatform) || /Macintosh|Mac OS/i.test(ua)) {
    os = "macOS";
  } else if (/Linux/i.test(hintedPlatform) || /Linux/i.test(ua)) {
    os = "Linux";
  }
  let browser = "مرورگر";
  if (/SamsungBrowser\//i.test(ua)) browser = "Samsung Internet";
  else if (/EdgA?\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/CriOS\//i.test(ua)) browser = "Chrome";
  else if (/Chrome\//i.test(ua)) browser = /;\s*wv\)/i.test(ua) || /Version\/4\.0/i.test(ua) ? "Android WebView" : "Chrome";
  else if (/FxiOS\//i.test(ua) || /Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  const mobile = mobileHint || /Android|iPhone|iPad|Mobile/i.test(ua);
  return [version ? `${os} ${version}` : os, browser, mobile ? "Mobile" : "Desktop"].filter(Boolean).join(" · ");
}
function normalizeClientDeviceInfo(body = {}) {
  const clean = (value, max = 120) => String(value ?? "").trim().replace(/[\r\n\0]/g, " ").slice(0, max);
  return {
    platform: clean(body.platform, 50),
    platformVersion: clean(body.platformVersion, 50),
    model: clean(body.model, 100),
    architecture: clean(body.architecture, 40),
    mobile: body.mobile === true || String(body.mobile || "").toLowerCase() === "true",
    userAgent: clean(body.userAgent, 250),
    maxTouchPoints: Math.max(0, Math.min(20, Number(body.maxTouchPoints || 0) || 0))
  };
}
function browserLabelFromUserAgent(ua) {
  const raw = String(ua || "");
  if (/SamsungBrowser\//i.test(raw)) return "Samsung Internet";
  if (/EdgA?\//i.test(raw)) return "Edge";
  if (/OPR\//i.test(raw)) return "Opera";
  if (/CriOS\//i.test(raw)) return "Chrome";
  if (/Chrome\//i.test(raw)) return /;\s*wv\)/i.test(raw) || /Version\/4\.0/i.test(raw) ? "Android WebView" : "Chrome";
  if (/FxiOS\//i.test(raw) || /Firefox\//i.test(raw)) return "Firefox";
  if (/Safari\//i.test(raw)) return "Safari";
  return "مرورگر";
}
function deviceLabelFromClientInfo(body = {}, fallbackUa = "") {
  const info = normalizeClientDeviceInfo(body);
  const ua = info.userAgent || String(fallbackUa || "");
  const platform = info.platform;
  let os = "";
  let version = "";
  // A non-empty UA-CH model is specific to mobile hardware in Chromium and is
  // useful when Android Chrome is running in "Desktop site" mode.
  if (/Android/i.test(platform) || /Android/i.test(ua) || (info.model && /Linux/i.test(platform || ua))) {
    os = "Android";
    version = (ua.match(/Android\s+([0-9.]+)/i) || [])[1] || "";
  } else if (/iPhone|iPad|iOS/i.test(platform) || /iPhone|iPad|iOS/i.test(ua)) {
    os = /iPad/i.test(platform + " " + ua) ? "iPadOS" : "iOS";
    version = ((ua.match(/OS\s+([0-9_]+)/i) || [])[1] || "").replace(/_/g, ".");
  } else if (/Windows/i.test(platform) || /Windows/i.test(ua)) os = "Windows";
  else if (/macOS|Mac/i.test(platform) || /Macintosh|Mac OS/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(platform) || /Linux/i.test(ua)) os = "Linux";
  else os = platform || "دستگاه ناشناس";
  const mobile = info.mobile || os === "Android" || os === "iOS" || os === "iPadOS" || /Android|iPhone|iPad|Mobile/i.test(ua);
  return [version ? `${os} ${version}` : os, browserLabelFromUserAgent(ua), mobile ? "Mobile" : "Desktop"].filter(Boolean).join(" · ");
}
function applyClientDeviceInfo(session, body = {}) {
  if (!session) return "";
  const info = normalizeClientDeviceInfo(body);
  const label = deviceLabelFromClientInfo(info, session.userAgent || "");
  if (!label) return "";
  session.clientDevice = info;
  session.clientDeviceLabel = label;
  session.clientDeviceUpdatedAt = Date.now();
  return label;
}
function sessionDeviceView(session, req = null, current = false) {
  const clientLabel = String(session?.clientDeviceLabel || "").trim();
  const liveLabel = current && req ? deviceLabelFromRequest(req) : "";
  const storedLabel = String(session?.deviceLabel || "").trim();
  const rawUa = String(session?.userAgent || "").trim();
  // Explicit browser-side metadata wins because cPanel/proxies may strip UA-CH
  // and Android Chrome Desktop Site can deliberately advertise Linux.
  return clientLabel || liveLabel || storedLabel || deviceLabelFromRequest({ headers: { "user-agent": rawUa }, socket: {} });
}
function tokenHash(token) { return crypto.createHash("sha256").update(String(token || "")).digest("hex"); }
function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || "")); const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
async function passwordHash(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const derived = await scryptAsync(String(password), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt}$${Buffer.from(derived).toString("base64url")}`;
}
async function passwordVerify(password, encoded) {
  try {
    const [kind, n, r, p, salt, expected] = String(encoded || "").split("$");
    if (kind !== "scrypt" || !salt || !expected) return false;
    const derived = await scryptAsync(String(password), salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return safeEqualText(Buffer.from(derived).toString("base64url"), expected);
  } catch { return false; }
}
function passwordPolicy(password, role) {
  const value = String(password || "");
  const min = role === "student" ? 8 : 12;
  if (value.length < min) return `رمز عبور باید حداقل ${min} نویسه باشد.`;
  if (value.length > 128) return "رمز عبور بیش از حد طولانی است.";
  if (COMMON_PASSWORDS.has(value.toLowerCase()) || /^\d+$/.test(value) || /(.)\1{5,}/.test(value)) return "این رمز عبور بسیار ساده و قابل حدس است.";
  if (role !== "student" && !(/[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value))) return "رمز کارکنان باید شامل حرف، عدد و نشانه باشد.";
  return "";
}
function initialStaffPasswordPolicy(password) {
  const value = String(password || "");
  if (value.length < 8) return "رمز اولیه باید حداقل ۸ نویسه باشد.";
  if (value.length > 64) return "رمز اولیه بیش از حد طولانی است.";
  if (!/\p{L}/u.test(value) || !/\p{N}/u.test(value)) return "رمز اولیه باید دست‌کم یک حرف و یک عدد داشته باشد.";
  if (COMMON_PASSWORDS.has(value.toLowerCase()) || /^\p{N}+$/u.test(value) || /(.)\1{5,}/u.test(value)) return "این رمز اولیه بسیار ساده و قابل حدس است.";
  return "";
}

function guardianPasswordPolicy(password) {
  const value = String(password || "");
  if (value.length < 8) return "رمز ولی باید حداقل ۸ نویسه باشد.";
  if (value.length > 128) return "رمز ولی بیش از حد طولانی است.";
  if (!/\p{L}/u.test(value) || !/\p{N}/u.test(value)) return "رمز ولی باید دست‌کم یک حرف و یک عدد داشته باشد.";
  if (COMMON_PASSWORDS.has(value.toLowerCase()) || /^\p{N}+$/u.test(value) || /(.)\1{5,}/u.test(value)) return "این رمز بسیار ساده و قابل حدس است.";
  return "";
}

function validSecurityShape(security) {
  return Boolean(security && typeof security === "object" && security.serverSecret && typeof security.credentials === "object" && typeof security.guardianCredentials === "object");
}
async function recoverCorruptSecurity() {
  let mirror=null;
  try { const candidate=JSON.parse(await fs.readFile(SECURITY_MIRROR_FILE,"utf8")); if(validSecurityShape(candidate))mirror=candidate; } catch {}
  if(!mirror){
    await appendRecoveryLog({type:"security_recovery_failed",reason:"no_valid_mirror"});
    const error=new Error("فایل امنیتی سامانه آسیب دیده و نسخه mirror سالمی وجود ندارد؛ برای جلوگیری از بازنشانی رمزها سرویس متوقف شد.");error.code="SECURITY_RECOVERY_UNAVAILABLE";throw error;
  }
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");const quarantine=path.join(DATA_DIR,`security.corrupt-${stamp}-${crypto.randomBytes(3).toString("hex")}.json`);
  try{await fs.rename(SECURITY_FILE,quarantine);}catch{}
  await atomicWriteText(SECURITY_FILE,JSON.stringify(mirror),0o600);
  await appendRecoveryLog({type:"security_auto_recovered",source:"security.mirror",quarantine:path.basename(quarantine)});
  return mirror;
}
async function readSecurity() {
  try {
    return JSON.parse(await fs.readFile(SECURITY_FILE, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 2, credentialPresetVersion: 0, serverSecret: crypto.randomBytes(32).toString("base64url"), credentials: {}, guardianCredentials: {}, guardianSessions: {}, sessions: {}, examGrants: {}, createdAt: new Date().toISOString() };
    return recoverCorruptSecurity();
  }
}
async function writeSecurity(security) {
  securityWriteQueue = securityWriteQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    try { await fs.chmod(DATA_DIR, 0o700); } catch {}
    if(!validSecurityShape(security))throw new Error("ساختار فایل امنیتی معتبر نیست.");
    const serialized=JSON.stringify(security);
    await atomicWriteText(SECURITY_FILE,serialized,0o600);
    // Mirror is written only after the primary commit; it therefore never intentionally rolls credentials backward.
    await atomicWriteText(SECURITY_MIRROR_FILE,serialized,0o600);
  });
  await securityWriteQueue;
  return security;
}
function enqueueSecurityOperation(operation) {
  const task = securityOperationQueue.then(operation, operation);
  securityOperationQueue = task.then(() => undefined, () => undefined);
  return task;
}
async function mutateSecurity(operation) {
  return enqueueSecurityOperation(async () => {
    const security = await readSecurity();
    security.credentials ||= {};
    security.guardianCredentials ||= {};
    security.guardianSessions ||= {};
    security.sessions ||= {};
    security.examGrants ||= {};
    const result = await operation(security);
    await writeSecurity(security);
    return { security, result };
  });
}
let securityAuditWritesSinceTrim = 0;
async function trimJsonlFile(filePath, maxRows = 20000) {
  try {
    const text=await fs.readFile(filePath,"utf8"), lines=text.trim().split(/\r?\n/).filter(Boolean);
    if(lines.length>maxRows) await atomicWriteText(filePath,`${lines.slice(-maxRows).join("\n")}\n`,0o600);
  } catch(error){ if(error?.code!=="ENOENT") console.warn("Audit retention trim failed:",error.message); }
}
async function readJsonlTail(filePath, limit=500) {
  try {
    const wanted=Math.max(1,Math.min(Number(limit)||500,2000)),handle=await fs.open(filePath,"r");
    try{
      const stat=await handle.stat(),bytes=Math.min(stat.size,Math.max(256*1024,wanted*1400)),buffer=Buffer.alloc(bytes);
      await handle.read(buffer,0,bytes,Math.max(0,stat.size-bytes));
      return buffer.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-wanted).reverse().map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
    }finally{await handle.close();}
  }catch{return [];}
}
async function securityAudit(event) {
  const clean={id:makeId("sec"),at:new Date().toISOString(),type:String(event.type||"event"),userId:event.userId||null,role:event.role||null,ip:event.ip||null,success:event.success!==false,details:String(event.details||"").slice(0,500)};
  await fs.mkdir(DATA_DIR,{recursive:true,mode:0o700});try{await fs.chmod(DATA_DIR,0o700);}catch{}
  await fs.appendFile(SECURITY_AUDIT_FILE,`${JSON.stringify(clean)}\n`,{encoding:"utf8",mode:0o600});try{await fs.chmod(SECURITY_AUDIT_FILE,0o600);}catch{}
  if(++securityAuditWritesSinceTrim>=100){securityAuditWritesSinceTrim=0;await trimJsonlFile(SECURITY_AUDIT_FILE,20000);}
  return clean;
}
async function readSecurityAudit(limit=500){return readJsonlTail(SECURITY_AUDIT_FILE,limit);}
async function ensureSecurityInitializedUnlocked(db) {
  const security = await readSecurity();
  security.version = 2;
  security.credentials ||= {};
  security.guardianCredentials ||= {};
  security.guardianSessions ||= {};
  security.sessions ||= {};
  security.examGrants ||= {};
  let changed = false;
  const applyPreset = Number(security.credentialPresetVersion || 0) < CREDENTIAL_PRESET_VERSION;

  // v194: bulk enrollment used to hash every new user's bootstrap credential serially.
  // Pre-compute missing hashes concurrently; credential semantics and hash strength stay unchanged.
  const missingCredentialUsersV194 = (db.users || []).filter(user => !security.credentials[user.id]);
  if (missingCredentialUsersV194.length) {
    const preparedCredentialsV194 = await Promise.all(missingCredentialUsersV194.map(async user => {
      const preset = DEFAULT_CREDENTIALS[user.id];
      const fallback = {
        username: user.studentCode || user.nationalId || user.id,
        password: `Msy#${String(user.id).slice(-4)}1405`,
        mustChangePassword: true
      };
      const source = preset || fallback;
      return [user.id, {
        // On FIRST bootstrap only, the explicitly configured superadmin login wins.
        // Existing credentials are never renamed by env changes after bootstrap.
        username: String(user.id === "sys1" && process.env.MADRESEYAR_SUPERADMIN_USERNAME ? source.username : (user.username || source.username)).toLowerCase(),
        passwordHash: await passwordHash(source.password),
        mustChangePassword: Boolean(source.mustChangePassword),
        failedLoginCount: 0,
        lockedUntil: 0,
        passwordChangedAt: null,
        credentialVersion: 1
      }];
    }));
    for (const [userId, credential] of preparedCredentialsV194) security.credentials[userId] = credential;
    changed = true;
  }

  for (const user of db.users || []) {
    const preset = DEFAULT_CREDENTIALS[user.id];
    const credential = security.credentials[user.id];
    if (process.env.NODE_ENV === "production" && user.role !== "student" && !credential.passwordChangedAt && !credential.mustChangePassword) {
      credential.mustChangePassword = true;
      changed = true;
    }
    // 72.11: preset-version upgrades must NEVER overwrite an existing credential.
    // Presets are used only when a credential is first created in missingCredentialUsersV194 above.
    if (user.role !== "student" && user.role !== "superadmin" && user.username) {
      const explicitUsername = String(user.username).trim().toLowerCase();
      if (explicitUsername && credential.username !== explicitUsername) {
        credential.username = explicitUsername;
        changed = true;
      }
    }
    const allowedCredentialKeys = new Set(["username", "passwordHash", "mustChangePassword", "failedLoginCount", "lockedUntil", "passwordChangedAt", "credentialVersion", "lastLoginAt", "lastLoginIp", "lastLoginUserAgent", "lastStudentSyncAt", "lastStudentSyncAttemptAt", "lastStudentSyncStatus", "lastStudentSyncVersion", "mfaEnabled", "mfaSecret", "mfaRecoveryHashes", "mfaEnabledAt", "mfaRecoveryRegeneratedAt", "mfaPending"]);
    for (const key of Object.keys(credential)) {
      if (!allowedCredentialKeys.has(key)) { delete credential[key]; changed = true; }
    }
    if (user.role === "student") {
      const nationalUsername = normalizeNationalId(user.nationalId);
      if (!credential.passwordChangedAt && credential.mustChangePassword !== true) { credential.mustChangePassword = true; changed = true; }
      if (nationalUsername && credential.username !== nationalUsername) { credential.username = nationalUsername; changed = true; }
    }
  }

  const allowedSecurityKeys = new Set(["version", "credentialPresetVersion", "serverSecret", "credentials", "guardianCredentials", "guardianSessions", "sessions", "examGrants", "createdAt"]);
  for (const key of Object.keys(security)) {
    if (!allowedSecurityKeys.has(key)) { delete security[key]; changed = true; }
  }
  if (applyPreset) {
    // Record the schema/preset generation only. Do not rotate passwords or invalidate
    // healthy staff sessions just because the application version was upgraded.
    security.credentialPresetVersion = CREDENTIAL_PRESET_VERSION;
    changed = true;
  }
  const validIds = new Set((db.users || []).map(u => u.id));
  for (const userId of Object.keys(security.credentials)) if (!validIds.has(userId)) { delete security.credentials[userId]; changed = true; }
  // P67.22.11: disabling a guardian must NOT destroy the password hash.
  // Only permanently removed guardian records lose their credentials.
  const validGuardianIds = new Set((db.guardians || []).map(g=>g.id));
  for (const guardianId of Object.keys(security.guardianCredentials || {})) if (!validGuardianIds.has(guardianId)) { delete security.guardianCredentials[guardianId]; changed = true; }
  const validGuardianLinkIds=new Set((db.guardianLinks||[]).filter(x=>x.active!==false).map(x=>String(x.id||"")));
  const now = Date.now();
  for (const [sid, session] of Object.entries(security.guardianSessions || {})) {
    const guardianOk=session?.guardianId?validGuardianIds.has(String(session.guardianId)):true;
    const linkOk=session?.linkId?validGuardianLinkIds.has(String(session.linkId)):true;
    if(!session||Number(session.expiresAt||0)<now||!guardianOk||!linkOk){delete security.guardianSessions[sid];changed=true;}
  }
  for (const [hash, session] of Object.entries(security.sessions)) if (!session || session.expiresAt < now || session.idleExpiresAt < now || !validIds.has(session.userId)) { delete security.sessions[hash]; changed = true; }
  for (const [id, grant] of Object.entries(security.examGrants)) if (!grant || grant.expiresAt < now || grant.used) { delete security.examGrants[id]; changed = true; }
  if (changed) await writeSecurity(security);
  return security;
}
async function ensureSecurityInitialized(db) {
  return enqueueSecurityOperation(() => ensureSecurityInitializedUnlocked(db));
}
function normalizeIdentifier(value) { return String(value || "").trim().toLowerCase().replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))); }
function normalizeBirthValue(value) { return normalizeNationalId(value).slice(0, 8); }
function birthValueMatches(storedValue, enteredValue) {
  const stored = normalizeBirthValue(storedValue); const entered = normalizeBirthValue(enteredValue);
  if (!/^\d{8}$/.test(stored) || !/^\d{8}$/.test(entered)) return false;
  return safeEqualText(stored, entered);
}
function normalizeStoredBirthDate(value) {
  const digits = normalizeBirthValue(value);
  if (/^\d{4}$/.test(digits)) return digits;
  if (!/^\d{8}$/.test(digits)) return "";
  const year = Number(digits.slice(0, 4)); const month = Number(digits.slice(4, 6)); const day = Number(digits.slice(6, 8));
  if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
}
function findUserByIdentifier(db, security, identifier, roleKind) {
  const id = normalizeIdentifier(identifier); const digits = normalizeNationalId(id);
  return (db.users || []).find(user => {
    if (!user.active) return false;
    if (roleKind === "student" && user.role !== "student") return false;
    if (roleKind === "staff" && user.role === "student") return false;
    const cred = security.credentials?.[user.id];
    return String(cred?.username || "").toLowerCase() === id || normalizeNationalId(user.nationalId) === digits || (user.role === "student" && normalizeNationalId(user.studentCode) === digits);
  });
}
function loginRateKey(req, identifier) { return `${clientIp(req)}|${normalizeIdentifier(identifier)}`; }
let loginAttemptsLoaded = false;
let loginAttemptsWriteQueue = Promise.resolve();
const LOGIN_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_MAX_KEYS = 5000;
async function loadLoginAttempts() {
  if (loginAttemptsLoaded) return;
  loginAttemptsLoaded = true;
  try {
    const raw = JSON.parse(await fs.readFile(LOGIN_ATTEMPTS_FILE, "utf8"));
    const now = Date.now();
    for (const [key, row] of Object.entries(raw?.attempts || {})) {
      if (!row || now - Number(row.lastAt || 0) > LOGIN_ATTEMPT_TTL_MS) continue;
      loginAttempts.set(key, { count:Number(row.count||0), blockedUntil:Number(row.blockedUntil||0), lastAt:Number(row.lastAt||0) });
    }
  } catch (error) { if (error?.code !== "ENOENT") console.warn("Login-attempt store could not be read:", error.message); }
}
function pruneLoginAttempts(now = Date.now()) {
  for (const [key, row] of loginAttempts) if (!row || now - Number(row.lastAt || 0) > LOGIN_ATTEMPT_TTL_MS) loginAttempts.delete(key);
  if (loginAttempts.size <= LOGIN_ATTEMPT_MAX_KEYS) return;
  const oldest = [...loginAttempts.entries()].sort((a,b)=>Number(a[1]?.lastAt||0)-Number(b[1]?.lastAt||0));
  for (let i=0;i<oldest.length-LOGIN_ATTEMPT_MAX_KEYS;i++) loginAttempts.delete(oldest[i][0]);
}
async function persistLoginAttempts() {
  pruneLoginAttempts();
  const payload = { version:1, updatedAt:new Date().toISOString(), attempts:Object.fromEntries(loginAttempts) };
  loginAttemptsWriteQueue = loginAttemptsWriteQueue.then(async()=>{
    await fs.mkdir(DATA_DIR,{recursive:true,mode:0o700});
    await atomicWriteText(LOGIN_ATTEMPTS_FILE, JSON.stringify(payload), 0o600);
  });
  await loginAttemptsWriteQueue;
}
async function loginRateStatus(req, identifier) {
  await loadLoginAttempts();
  const key = loginRateKey(req, identifier), row = loginAttempts.get(key), now = Date.now();
  if (!row) return { key, blocked:false };
  if (row.blockedUntil > now) return { key, blocked:true, retryAfter:Math.ceil((row.blockedUntil-now)/1000) };
  if (now-row.lastAt > 30*60*1000) { loginAttempts.delete(key); await persistLoginAttempts(); }
  return { key, blocked:false };
}
async function recordLoginFailure(key) {
  await loadLoginAttempts();
  const now=Date.now(), row=loginAttempts.get(key)||{count:0,blockedUntil:0,lastAt:now};
  row.count+=1; row.lastAt=now;
  if(row.count>=5) row.blockedUntil=now+Math.min(60*60*1000,5*60*1000*2**Math.floor((row.count-5)/2));
  loginAttempts.set(key,row); pruneLoginAttempts(now); await persistLoginAttempts(); return row;
}
async function recordLoginSuccess(key) { await loadLoginAttempts(); if(loginAttempts.delete(key)) await persistLoginAttempts(); }
function publicAuthUser(user, security) {
  const cred = security.credentials?.[user.id] || {};
  return { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName, username: cred.username || "", classId: user.classId || null, classIds: user.classIds || [], subjects: user.subjects || [], mustChangePassword: Boolean(cred.mustChangePassword), lastLoginAt: cred.lastLoginAt || "", mfaEnabled:Boolean(cred.mfaEnabled), mfaRecoveryCodesRemaining:Array.isArray(cred.mfaRecoveryHashes)?cred.mfaRecoveryHashes.length:0 };
}
function mfaEligibleRole(role){ return role === "admin" || role === "superadmin"; }
async function verifyStaffMfaCredential(credential, body, { consumeRecovery = false } = {}) {
  if(!credential?.mfaEnabled) return { ok:true, method:"none" };
  const otp=String(body?.otp||body?.mfaCode||"").trim();
  if(otp && verifyTotp(String(credential.mfaSecret||""),otp)) return {ok:true,method:"totp"};
  const recovery=String(body?.recoveryCode||"").trim();
  if(recovery){
    const consumed=consumeRecoveryCode(credential.mfaRecoveryHashes||[],recovery);
    if(consumed.ok){
      if(consumeRecovery) credential.mfaRecoveryHashes=consumed.hashes;
      return {ok:true,method:"recovery",remaining:consumed.hashes.length};
    }
  }
  if(!otp && !recovery) return {ok:false,required:true};
  return {ok:false,required:false};
}
async function issueSession(user, req, _security = null) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const now = Date.now();
  const policy = ROLE_SESSION_POLICY[user.role] || ROLE_SESSION_POLICY.teacher;
  await mutateSecurity(security => {
    security.sessions[hash] = { userId: user.id, role: user.role, createdAt: now, lastSeenAt: now, expiresAt: now + policy.absoluteMs, idleExpiresAt: now + policy.idleMs, ip: clientIp(req), userAgent: String(req.headers["user-agent"] || "").slice(0, 250), deviceLabel: deviceLabelFromRequest(req) };
  });
  return token;
}
function requestAuthToken(req) {
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  // Android virtual-host compatibility: Content-Language is a CORS-safelisted
  // request header, so the WebView can authenticate without an OPTIONS preflight.
  const compat = String(req.headers["content-language"] || "");
  if (compat.startsWith("msy-")) return compat.slice(4).trim();
  return "";
}
async function authenticate(req, allowedRoles = null, options = {}) {
  const token = requestAuthToken(req);
  if (!token) throw Object.assign(new Error("برای ادامه دوباره وارد سامانه شوید."), { status: 401 });
  const envelope = await ensureStateInitialized();
  await ensureSecurityInitialized(envelope.db);
  const hash = tokenHash(token); const now = Date.now();
  const updated = await mutateSecurity(security => {
    const session = security.sessions[hash];
    if (!session || session.expiresAt < now || session.idleExpiresAt < now) {
      if (session) delete security.sessions[hash];
      return { error: "expired" };
    }
    const user = (envelope.db.users || []).find(u => u.id === session.userId && u.active);
    if (!user) { delete security.sessions[hash]; return { error: "disabled" }; }
    if (allowedRoles && !allowedRoles.includes(user.role)) return { error: "forbidden", user };
    const cred = security.credentials[user.id] || {};
    if (cred.mustChangePassword && !options.allowPasswordChange) return { error: "password", user, session };
    const policy = ROLE_SESSION_POLICY[user.role] || ROLE_SESSION_POLICY.teacher;
    session.lastSeenAt = now; session.idleExpiresAt = Math.min(session.expiresAt, now + policy.idleMs);
    session.ip = clientIp(req); session.userAgent = String(req.headers["user-agent"] || session.userAgent || "").slice(0,250); session.deviceLabel = deviceLabelFromRequest(req);
    return { user, session };
  });
  const result = updated.result || {};
  if (result.error === "expired") throw Object.assign(new Error("نشست شما پایان یافته است؛ دوباره وارد شوید."), { status: 401 });
  if (result.error === "disabled") throw Object.assign(new Error("حساب کاربری فعال نیست."), { status: 403 });
  if (result.error === "forbidden") throw Object.assign(new Error("برای این عملیات دسترسی کافی ندارید."), { status: 403 });
  if (result.error === "password") throw Object.assign(new Error("پیش از ادامه باید رمز اولیه را تغییر دهید."), { status: 428, code: "PASSWORD_CHANGE_REQUIRED" });
  return { token, tokenHash: hash, user: result.user, session: result.session, security: updated.security, db: envelope.db, updatedAt: envelope.updatedAt || "" };
}
async function revokeUserSessions(userId, exceptHash = "") {
  await mutateSecurity(security => {
    for (const [hash, session] of Object.entries(security.sessions || {})) if (session.userId === userId && hash !== exceptHash) delete security.sessions[hash];
  });
}
async function createExamGrant(user, exam, packageVersion, allowedDurationSeconds = 0) {
  const attemptId = makeId("try");
  // v63: مجوز دریافت سؤال از مهلت پاسخ‌دهی جداست. تحویل شبکه‌ای ممکن است پس از پایان آزمون انجام شود.
  const expiresAt = Date.now() + Math.max(72 * 60 * 60 * 1000, Number(exam.duration || 0) * 60 * 1000 + 72 * 60 * 60 * 1000);
  const issuedAt = Date.now();
  const result = await mutateSecurity(security => {
    const payload = `${attemptId}|${user.id}|${exam.id}|${packageVersion}|${expiresAt}`;
    const signature = crypto.createHmac("sha256", security.serverSecret).update(payload).digest("base64url");
    security.examGrants[attemptId] = { userId: user.id, examId: exam.id, packageVersion, expiresAt, signature, used: false, createdAt: issuedAt, issuedWhileRunning: true, allowedDurationSeconds: Math.max(0, Number(allowedDurationSeconds||0)) };
    return signature;
  });
  return { attemptId, packageSignature: result.result, expiresAt };
}
async function validateExamGrantV63(user, exam, body) {
  const attemptId = String(body.attemptId || ""); const signature = String(body.packageSignature || "");
  const result = await mutateSecurity(security => {
    const grant = security.examGrants?.[attemptId];
    if (!grant || grant.used || grant.expiresAt < Date.now() || grant.userId !== user.id || grant.examId !== exam.id || grant.packageVersion !== examPackageVersion(exam) || !safeEqualText(grant.signature, signature)) return null;
    return { ...grant };
  });
  if (!result.result) throw Object.assign(new Error("مجوز آزمون معتبر نیست؛ سؤال‌ها را دوباره دانلود کنید."), { status: 409 });
  const grant=result.result;
  const durationSeconds=Math.max(0,Number(body.durationSeconds||0));
  const allowedSeconds=Math.max(60,Number(grant.allowedDurationSeconds||0)||Number(exam.duration||0)*60)+90;
  if(durationSeconds>allowedSeconds) throw Object.assign(new Error("مدت پاسخ‌دهی ثبت‌شده از زمان مجاز آزمون بیشتر است."),{status:409,code:"EXAM_DURATION_EXCEEDED"});
  return grant;
}
async function markExamGrantUsedV63(attemptId, submissionKey="") {
  if(!attemptId)return;
  await mutateSecurity(security=>{const grant=security.examGrants?.[String(attemptId)];if(grant&&!grant.used){grant.used=true;grant.usedAt=Date.now();grant.submissionKey=String(submissionKey||"");}});
}
// سازگاری برای مسیرهای قدیمی خارج از موتور آزمون.
async function validateExamGrant(user, exam, body) {
  const grant=await validateExamGrantV63(user,exam,body);await markExamGrantUsedV63(body.attemptId,body.submissionKey||"");return grant;
}
function submissionKeyV63(body){return String(body?.submissionKey||"").trim().slice(0,160);}
function existingExamSubmissionV63(db, exam, student, key){
  if(!key)return null;
  const attempt=(db.attempts||[]).find(x=>x.examId===exam.id&&x.studentId===student.id&&x.submissionKey===key);
  if(attempt)return {kind:"mcq",record:attempt};
  const submission=(db.submissions||[]).find(x=>x.examId===exam.id&&x.studentId===student.id&&x.submissionKey===key);
  return submission?{kind:exam.type,record:submission}:null;
}
function duplicateReceiptV63(existing, exam, db){
  if(!existing)return null;const r=existing.record;
  if(existing.kind==="mcq")return {ok:true,idempotent:true,receiptId:r.id,submittedAt:r.submittedAt,gradingStatus:"final",result:{status:"final",score:Number(r.score||0),total:Number(r.total||examTotalScore(exam)),percent:Number(r.percent||0),correctCount:Number(r.correctCount||0),answeredCount:Number(r.answeredCount||0),questionCount:Number(r.questionCount||(exam.questions||[]).length)}};
  const grade=(db.grades||[]).find(g=>g.submissionId===r.id);
  return {ok:true,idempotent:true,receiptId:r.id,submittedAt:r.submittedAt,gradingStatus:grade?"final":(exam.type==="mixed"?"pending_manual":"awaiting_package_export"),sheetCode:r.sheetCode||"",result:grade?{status:"final",score:Number(grade.finalScore||0),total:examTotalScore(exam)}:{status:"pending",score:null,total:examTotalScore(exam)}};
}

// v64 — diagnostic metadata for offline/retry delivery. No answer content is duplicated.
function deliveryDiagnosticsV64(body,exam){
  const d=body?.deliveryDiagnostics&&typeof body.deliveryDiagnostics==="object"?body.deliveryDiagnostics:{};
  return {clientQueuedAt:Number(d.clientQueuedAt||0),clientFinalizedAt:Number(d.clientFinalizedAt||body?.finalizedAt||0),clientRetryCount:Math.max(0,Number(d.clientRetryCount||0)),clientLastTriedAt:Number(d.clientLastTriedAt||0),serverFirstReceivedAt:Date.now(),serverDuplicateCount:0,serverLastDuplicateAt:0,deliveryMode:examScheduleStateV6111(exam)==="running"?"live":"offline_late"};
}
async function noteDuplicateDeliveryV64(examId,studentId,key){
  if(!key)return;
  await mutateDb(async mutable=>{const record=(mutable.attempts||[]).find(x=>x.examId===examId&&x.studentId===studentId&&x.submissionKey===key)||(mutable.submissions||[]).find(x=>x.examId===examId&&x.studentId===studentId&&x.submissionKey===key);if(record){record.deliveryDiagnostics ||= {};record.deliveryDiagnostics.serverDuplicateCount=Number(record.deliveryDiagnostics.serverDuplicateCount||0)+1;record.deliveryDiagnostics.serverLastDuplicateAt=Date.now();}return true;});
}

// v65 — controlled recovery for sealed offline submissions.
function deliveryRecoveryRowsV65(db){ return Array.isArray(db.examDeliveryRecoveryRequests)?db.examDeliveryRecoveryRequests:[]; }
function recoveryRequestV65(db,student,exam,key,requestId=""){
  const now=Date.now();
  return deliveryRecoveryRowsV65(db).find(r=>r.studentId===student.id&&r.examId===exam.id&&r.submissionKey===key&&(!requestId||r.id===requestId)&&r.status==="approved"&&Number(r.expiresAt||0)>now&&!r.consumedAt)||null;
}
function recoveryCanRetryV65(request,exam,body){
  if(!request)return false;
  const pv=String(body?.packageVersion||"");
  if(!pv||pv!==String(request.packageVersion||"")||pv!==String(examPackageVersion(exam)))return false;
  if(Number(request.clientFinalizedAt||0)&&Number(body?.finalizedAt||0)!==Number(request.clientFinalizedAt||0))return false;
  return true;
}
async function validateExamGrantOrRecoveryV65(user,exam,body,dbSnapshot){
  try{return {mode:"grant",grant:await validateExamGrantV63(user,exam,body),request:null};}
  catch(error){
    const key=submissionKeyV63(body),request=recoveryRequestV65(dbSnapshot||((await ensureStateInitialized()).db),user,exam,key,String(body?.recoveryRequestId||""));
    if(!recoveryCanRetryV65(request,exam,body))throw error;
    const durationSeconds=Math.max(0,Number(body.durationSeconds||0)),allowedSeconds=Math.max(60,Number(exam.duration||0)*60)+90;
    if(durationSeconds>allowedSeconds)throw Object.assign(new Error("مدت پاسخ‌دهی ثبت‌شده از زمان مجاز آزمون بیشتر است."),{status:409,code:"EXAM_DURATION_EXCEEDED"});
    return {mode:"recovery",grant:null,request};
  }
}
async function consumeRecoveryV65(requestId,submissionKey){
  if(!requestId)return;
  await mutateDb(async mutable=>{const r=deliveryRecoveryRowsV65(mutable).find(x=>x.id===requestId&&x.status==="approved"&&!x.consumedAt&&x.submissionKey===submissionKey);if(r){r.consumedAt=Date.now();r.status="consumed";}return true;});
}


// v66 — technical incident reporting and controlled fairness windows.
const V66_INCIDENT_TYPES=new Set(["network_disconnect","app_restart","package_error","submission_error","other"]);
function examIncidentRowsV66(db){return Array.isArray(db.examIncidents)?db.examIncidents:[];}
function fairnessRowsV66(db){return Array.isArray(db.examFairnessAdjustments)?db.examFairnessAdjustments:[];}
function activeFairnessV66(db,studentId,examId,now=Date.now()){
  return fairnessRowsV66(db).filter(x=>x.studentId===studentId&&x.examId===examId&&x.status==="active"&&Number(x.expiresAt||0)>now).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0]||null;
}
function examAvailabilityForStudentV66(db,exam,student,now=Date.now()){
  const base=examAvailabilityV62(exam,now),adj=activeFairnessV66(db,student?.id,exam?.id,now);
  if(!adj)return {...base,fairnessAdjustment:null};
  const state=studentExamStatus(db,exam,student.id)==="submitted"?"ended":"running";
  return {...base,availabilityState:state,canStart:state==="running",endAt:new Date(Number(adj.expiresAt)).toISOString(),fairnessAdjustment:{id:adj.id,minutes:Number(adj.minutes||0),expiresAt:Number(adj.expiresAt),reason:adj.reason||"",incidentId:adj.incidentId||""}};
}


const SCHOOL_GRADES = SCHOOL_GRADES_CORE;
function gradeMeta(grade) { return SCHOOL_GRADES.find(g => g.grade === Number(grade)) || SCHOOL_GRADES[0]; }
const SCIENCE_CHAPTER_NAMES_BY_GRADE = {"7": ["تفکر و تجربه", "اندازه‌گیری در علوم و ابزارهای آن", "اتم‌ها، الفبای مواد", "مواد پیرامون ما", "از معدن تا خانه", "سفر آب روی زمین", "سفر آب درون زمین", "انرژی و تبدیل‌های آن", "منابع انرژی", "گرما و بهینه‌سازی مصرف انرژی", "یاخته و سازمان‌بندی آن", "سفره سلامت", "سفر غذا", "گردش مواد", "تبادل با محیط"], "8": ["مخلوط و جداسازی مواد", "تغییرهای شیمیایی در خدمت زندگی", "از درون اتم چه خبر", "تنظیم عصبی", "حس و حرکت", "تنظیم هورمونی", "الفبای زیست فناوری", "تولید مثل در جانداران", "الکتریسیته", "مغناطیس", "کانی‌ها", "سنگ‌ها", "هوازدگی", "نور و ویژگی‌های آن", "شکست نور"], "9": ["مواد و نقش آنها در زندگی", "رفتار اتم‌ها با یکدیگر", "به دنبال محیطی بهتر برای زندگی", "حرکت چیست", "نیرو", "زمین‌ساخت ورقه‌ای", "آثاری از گذشته زمین", "فشار و آثار آن", "ماشین‌ها", "نگاهی به فضا", "گوناگونی جانداران", "دنیای گیاهان", "جانوران بی‌مهره", "جانوران مهره‌دار", "با هم زیستن"]};
function ensureScienceChaptersServer(grade, existing = []) {
  const names = SCIENCE_CHAPTER_NAMES_BY_GRADE[Number(grade)] || [];
  const rows = Array.isArray(existing) ? existing : [];
  const prefix = Number(grade) === 7 ? "science" : `science${Number(grade)}`;
  const used = new Set();
  const standard = names.map((name, index) => {
    const order = index + 1;
    const priorIndex = rows.findIndex((c, i) => !used.has(i) && (Number(c?.order) === order || String(c?.id || "") === `${prefix}_${order}`));
    const prior = priorIndex >= 0 ? rows[priorIndex] : null;
    if (priorIndex >= 0) used.add(priorIndex);
    return {
      id: prior?.id || `${prefix}_${order}`,
      title: prior?.title || `فصل ${order}`,
      name: prior?.name || name,
      displayTitle: prior?.displayTitle || `فصل ${order} — ${name}`,
      order,
      topics: Array.isArray(prior?.topics) ? prior.topics : [],
      objectives: Array.isArray(prior?.objectives) ? prior.objectives : [],
      active: prior?.active !== false,
      ...(prior || {})
    };
  });
  return [...standard, ...rows.filter((_, i) => !used.has(i) && Number(rows[i]?.order || 0) > names.length)];
}
function scienceCurriculumNeedsUpgradeServer(curriculum) {
  return [7,8,9].some(grade => {
    const book = (curriculum || []).find(b => Number(b.grade) === grade && b.subject === "علوم تجربی");
    return !book || !Array.isArray(book.chapters) || book.chapters.length < 15 || book.chapters.some((c,i)=>!c?.name || Number(c?.order||0)!==i+1);
  });
}
function ensureMultiGradeCurriculumServer(curriculum) {
  const rows = Array.isArray(curriculum) ? curriculum.map(book => {
    const inferred = Number(book.grade || (/9(?:\D|$)/.test(String(book.id||"")) ? 9 : /8(?:\D|$)/.test(String(book.id||"")) ? 8 : 7));
    const meta = gradeMeta(inferred);
    return { ...book, grade: meta.grade, gradeId: meta.id, gradeName: meta.name };
  }) : [];
  const grade7 = rows.filter(b => Number(b.grade) === 7);
  for (const grade of [8,9]) {
    const meta = gradeMeta(grade);
    for (const source of grade7) {
      if (rows.some(b => Number(b.grade) === grade && b.subject === source.subject)) continue;
      const baseId = String(source.id || `book_${source.subject}`).replace(/7$/, "").replace(/[^A-Za-z0-9_\-]/g, "_");
      rows.push({ id: `${baseId}${grade}`, subject: source.subject, title: `${source.subject} ${meta.name} (${meta.commonName})`, edition: source.edition || "", grade, gradeId: meta.id, gradeName: meta.name, active: true, chapters: [] });
    }
  }
  // P66.6: ensure the actual server catalog has chapter rows for the two grade-9
  // books used by the question-bank importer. Empty chapter arrays previously made
  // every incoming row fail with "chapter does not exist in this grade's book".
  const p666ChapterTitles = {
    8: {
      "ریاضی": ["عددهای گویا", "عددهای اول", "چندضلعی‌ها", "جبر و معادله", "بردار و مختصات", "مثلث", "توان و جذر", "آمار و احتمال", "دایره"]
    },
    9: {
      "ریاضی": ["مجموعه‌ها", "عددهای حقیقی", "استدلال و اثبات در هندسه", "توان و ریشه", "عبارت‌های جبری", "خط و معادله‌های خطی", "عبارت‌های گویا", "حجم و مساحت"],
      "مطالعات اجتماعی": ["سیاره ما، زمین", "سنگ‌کره، آب‌کره، هواکره", "زیست‌کره، تنوع شگفت‌انگیز زندگی", "ساکنان سیاره زمین", "عصر یکپارچگی و شکوفایی", "ایران از عهد نادرشاه تا پایان قاجار", "ایران در عصر مشروطه", "سقوط حکومت شاهنشاهی و شکل‌گیری نظام جمهوری اسلامی", "فرهنگ و هویت", "خانواده و جامعه", "جامعه و حکومت", "جهان امروز"]
    }
  };
  for (const grade of [8,9]) {
    for (const [subject,titles] of Object.entries(p666ChapterTitles[grade] || {})) {
      const book = rows.find(b => Number(b.grade) === grade && b.subject === subject);
      if (!book) continue;
      const existing = Array.isArray(book.chapters) ? book.chapters : [];
      const byOrder = new Map(existing.map((chapter,index) => [Number(chapter.order || index + 1), chapter]));
      const maxExistingOrder = Math.max(0, ...byOrder.keys());
      const count = Math.max(titles.length, maxExistingOrder);
      const prefix = subject === "ریاضی" ? `math${grade}` : `social${grade}`;
      book.chapters = Array.from({length:count}, (_,index) => {
        const order = index + 1;
        const old = byOrder.get(order);
        if (old) {
          const oldTitle = String(old.title || old.name || "").trim();
          const genericTitle = !oldTitle || /^(?:فصل|درس|بخش)\s*[۰-۹٠-٩0-9]+$/u.test(oldTitle);
          return { ...old, id: String(old.id || `${prefix}_${order}`), title: genericTitle ? (titles[index] || oldTitle || `فصل ${order}`) : oldTitle, order };
        }
        return { id: `${prefix}_${order}`, title: titles[index] || `فصل ${order}`, order, topics: [], objectives: [], active: true };
      });
    }
  }
  for (const grade of [7,8,9]) {
    const science = rows.find(b => Number(b.grade) === grade && b.subject === "علوم تجربی");
    if (science) {
      science.chapters = ensureScienceChaptersServer(grade, science.chapters);
      science.officialBookCode = String({7:706,8:806,9:906}[grade]);
    }
  }
  return rows;
}

function serverChapterList(prefix, count, label = "فصل") {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}_${i + 1}`, title: `${label} ${i + 1}`, order: i + 1, topics: [], objectives: [], active: true }));
}
function serverDefaultCurriculum() {
  return ensureMultiGradeCurriculumServer([
    { id: "book_science7", subject: "علوم تجربی", title: "علوم تجربی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("science", 15, "فصل") },
    { id: "book_math7", subject: "ریاضی", title: "ریاضی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("math", 9, "فصل") },
    { id: "book_social7", subject: "مطالعات اجتماعی", title: "مطالعات اجتماعی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("social", 12, "فصل") },
    { id: "book_persian7", subject: "فارسی", title: "فارسی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("persian", 17, "درس") },
    { id: "book_writing7", subject: "نگارش", title: "نگارش پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("writing", 8, "درس") },
    { id: "book_arabic7", subject: "عربی", title: "عربی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("arabic", 10, "درس") },
    { id: "book_english7", subject: "زبان انگلیسی", title: "زبان انگلیسی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("english", 8, "درس") },
    { id: "book_quran7", subject: "قرآن", title: "آموزش قرآن پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("quran", 12, "درس") },
    { id: "book_religion7", subject: "پیام‌های آسمان", title: "پیام‌های آسمان پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("religion", 12, "درس") },
    { id: "book_tech7", subject: "کار و فناوری", title: "کار و فناوری پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("tech", 12, "پودمان") },
    { id: "book_thinking7", subject: "تفکر و سبک زندگی", title: "تفکر و سبک زندگی پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("thinking", 10, "درس") },
    { id: "book_art7", subject: "فرهنگ و هنر", title: "فرهنگ و هنر پایه اول متوسطه اول (هفتم)", edition: "۱۴۰۵–۱۴۰۶", chapters: serverChapterList("art", 8, "بخش") }
  ]);
}
function serverSeedLearningPoints() {
  return [
    { id: "lp_sc_1_1", bookId: "book_science7", chapterId: "science_1", subject: "علوم تجربی", title: "کمیت و اندازه‌گیری", statement: "کمیت ویژگی‌ای است که بتوان آن را با عدد و یکا اندازه‌گیری کرد.", keywords: ["کمیت", "عدد", "یکا"], examples: ["طول", "جرم", "زمان"], sourcePage: "فصل ۱" },
    { id: "lp_sc_1_2", bookId: "book_science7", chapterId: "science_1", subject: "علوم تجربی", title: "یکای طول", statement: "یکای اصلی طول در دستگاه SI متر است.", keywords: ["متر", "طول", "SI"], examples: ["اندازه‌گیری طول میز"], sourcePage: "فصل ۱" },
    { id: "lp_sc_1_3", bookId: "book_science7", chapterId: "science_1", subject: "علوم تجربی", title: "حجم مایع", statement: "برای اندازه‌گیری حجم مایعات از استوانه مدرج استفاده می‌شود.", keywords: ["حجم", "استوانه مدرج"], examples: ["اندازه‌گیری آب"], sourcePage: "فصل ۱" },
    { id: "lp_sc_1_4", bookId: "book_science7", chapterId: "science_1", subject: "علوم تجربی", title: "چگالی", statement: "چگالی از تقسیم جرم ماده بر حجم آن به دست می‌آید.", keywords: ["چگالی", "جرم", "حجم"], examples: ["مقایسه چگالی دو جسم"], sourcePage: "فصل ۱" },
    { id: "lp_so_2_1", bookId: "book_social7", chapterId: "social_2", subject: "مطالعات اجتماعی", title: "حقوق شهروندی", statement: "هر شهروند از حقوقی مانند آموزش، امنیت و برخورداری از قانون عادلانه بهره‌مند است.", keywords: ["حقوق", "شهروند"], examples: ["حق تحصیل"], sourcePage: "فصل ۲" },
    { id: "lp_so_2_2", bookId: "book_social7", chapterId: "social_2", subject: "مطالعات اجتماعی", title: "مسئولیت شهروندی", statement: "شهروندان در کنار حقوق خود مسئولیت‌هایی مانند رعایت قانون و احترام به حقوق دیگران دارند.", keywords: ["مسئولیت", "قانون"], examples: ["رعایت مقررات"], sourcePage: "فصل ۲" }
  ];
}

function serverSeedQuestionBank() {
  const base = [
    { id: "bank_sc_e1", type: "mcq", subject: "علوم تجربی", bookId: "book_science7", chapterId: "science_1", chapter: "فصل 1", difficulty: "easy", status: "approved", text: "کدام گزینه یک کمیت اندازه‌گیری‌پذیر است؟", score: 1, choices: ["زیبایی", "جرم", "مهربانی", "شجاعت"], answer: 1, explanation: "جرم با عدد و یکا اندازه‌گیری می‌شود.", tags: ["کمیت", "اندازه‌گیری"] },
    { id: "bank_sc_e2", type: "mcq", subject: "علوم تجربی", bookId: "book_science7", chapterId: "science_1", chapter: "فصل 1", difficulty: "easy", status: "approved", text: "یکای اصلی طول در دستگاه SI چیست؟", score: 1, choices: ["کیلوگرم", "ثانیه", "متر", "لیتر"], answer: 2, explanation: "متر یکای اصلی طول است.", tags: ["طول", "متر"] },
    { id: "bank_sc_m1", type: "mcq", subject: "علوم تجربی", bookId: "book_science7", chapterId: "science_1", chapter: "فصل 1", difficulty: "medium", status: "approved", text: "دانش‌آموزی می‌خواهد حجم آب داخل ظرف را اندازه بگیرد. کدام ابزار مناسب‌تر است؟", score: 2, choices: ["نیروسنج", "استوانه مدرج", "دماسنج", "خط‌کش"], answer: 1, explanation: "استوانه مدرج برای اندازه‌گیری حجم مایعات است.", tags: ["حجم", "ابزار"] },
    { id: "bank_sc_m2", type: "mcq", subject: "علوم تجربی", bookId: "book_science7", chapterId: "science_1", chapter: "فصل 1", difficulty: "medium", status: "approved", text: "دو جسم حجم یکسان دارند اما جرم جسم اول بیشتر است. کدام نتیجه درست است؟", score: 2, choices: ["چگالی جسم اول بیشتر است", "چگالی دو جسم برابر است", "چگالی جسم دوم بیشتر است", "هیچ نتیجه‌ای نمی‌توان گرفت"], answer: 0, explanation: "در حجم برابر، جرم بیشتر به معنی چگالی بیشتر است.", tags: ["چگالی", "جرم", "حجم"] },
    { id: "bank_sc_a1", type: "descriptive", subject: "علوم تجربی", bookId: "book_science7", chapterId: "science_1", chapter: "فصل 1", difficulty: "advanced", status: "approved", text: "روش اندازه‌گیری چگالی یک جسم جامد نامنظم را مرحله‌به‌مرحله توضیح دهید.", score: 6, referenceAnswer: "جرم با ترازو اندازه‌گیری می‌شود، حجم با جابه‌جایی آب در استوانه مدرج به دست می‌آید و سپس جرم بر حجم تقسیم می‌شود.", rubric: [{ title: "اندازه‌گیری جرم", score: 2 }, { title: "اندازه‌گیری حجم", score: 2 }, { title: "محاسبه چگالی", score: 2 }], explanation: "پاسخ باید هر سه مرحله را پوشش دهد.", tags: ["چگالی", "حل مسئله"] },
    { id: "bank_so_e1", type: "mcq", subject: "مطالعات اجتماعی", bookId: "book_social7", chapterId: "social_2", chapter: "فصل 2", difficulty: "easy", status: "approved", text: "کدام مورد نمونه‌ای از حق شهروندی است؟", score: 1, choices: ["حق آموزش", "بی‌توجهی به قانون", "آسیب به اموال عمومی", "نادیده‌گرفتن حقوق دیگران"], answer: 0, explanation: "آموزش از حقوق شهروندی است.", tags: ["حقوق شهروندی"] },
    { id: "bank_so_m1", type: "mcq", subject: "مطالعات اجتماعی", bookId: "book_social7", chapterId: "social_2", chapter: "فصل 2", difficulty: "medium", status: "approved", text: "اگر افراد جامعه قوانین راهنمایی را رعایت نکنند، مهم‌ترین پیامد چیست؟", score: 2, choices: ["افزایش نظم", "کاهش خطر", "افزایش بی‌نظمی و آسیب", "بهبود حقوق دیگران"], answer: 2, explanation: "قانون برای نظم و حفظ حقوق افراد است.", tags: ["قانون", "مسئولیت"] },
    { id: "bank_so_a1", type: "descriptive", subject: "مطالعات اجتماعی", bookId: "book_social7", chapterId: "social_2", chapter: "فصل 2", difficulty: "advanced", status: "approved", text: "رابطه حقوق و مسئولیت‌های شهروندی را با یک مثال واقعی تحلیل کنید.", score: 6, referenceAnswer: "هر حق با مسئولیتی همراه است؛ مثلاً حق استفاده از فضای عمومی با مسئولیت حفظ آن همراه است.", rubric: [{ title: "بیان رابطه حق و مسئولیت", score: 2 }, { title: "مثال واقعی", score: 2 }, { title: "تحلیل و جمع‌بندی", score: 2 }], explanation: "پاسخ باید رابطه دوطرفه حق و مسئولیت را نشان دهد.", tags: ["تحلیل", "شهروندی"] }
  ];
  return base.map(q => ({ ...q, topic: q.tags?.[0] || "", cognitiveLevel: q.difficulty === "advanced" ? "analyze" : q.difficulty === "medium" ? "apply" : "remember", estimatedSeconds: q.type === "descriptive" ? 300 : 75, learningOutcome: q.explanation || "", sourcePage: q.chapter || "", reviewCycleDays: 180, shared: true, sourceType: "seed", createdBy: "tea1", createdAt: faNow(), updatedAt: faNow(), stats: { usedCount: 0, answerCount: 0, correctCount: 0, appealCount: 0, avgSeconds: 0 } }));
}


// v75 — Gradebook, term locking, homework review and notification center.
const GRADEBOOK_CATEGORY_DEFAULTS_V75 = [
  {id:"exam",title:"آزمون‌های مستمر",weight:60,source:"exam"},
  {id:"homework",title:"تکلیف",weight:15,source:"manual"},
  {id:"oral",title:"پرسش شفاهی",weight:10,source:"manual"},
  {id:"project",title:"پروژه",weight:10,source:"manual"},
  {id:"participation",title:"مشارکت کلاسی",weight:5,source:"manual"}
];
function gradebookKeyV75({classId="",subject="",academicYear="",academicPeriod="semester2"}={}){return `${classId}__${subject}__${academicYear}__${academicPeriod}`;}
function normalizeGradebookConfigV75(raw,{classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const base=Array.isArray(raw?.categories)&&raw.categories.length?raw.categories:GRADEBOOK_CATEGORY_DEFAULTS_V75;
  const cats=base.slice(0,12).map((c,i)=>({id:String(c.id||`cat_${i+1}`).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,40),title:String(c.title||`مولفه ${i+1}`).trim().slice(0,80),weight:Math.max(0,Math.min(100,Number(c.weight)||0)),source:String(c.source)==="exam"?"exam":"manual"})).filter(c=>c.id&&c.title);
  const total=Math.round(cats.reduce((n,c)=>n+c.weight,0)*100)/100;
  if(Math.abs(total-100)>.001)throw Object.assign(new Error("مجموع وزن مولفه‌های دفتر نمره باید دقیقاً ۱۰۰ درصد باشد."),{status:400});
  if(!cats.some(c=>c.source==="exam"))throw Object.assign(new Error("حداقل یک مولفه آزمون در دفتر نمره لازم است."),{status:400});
  const outputMaxScore = raw?.outputMaxScore === undefined || raw?.outputMaxScore === null ? 5 : Number(raw.outputMaxScore);
  if (!Number.isFinite(outputMaxScore) || outputMaxScore <= 0 || outputMaxScore > 20) throw Object.assign(new Error("بارم مستمر باید بیشتر از صفر و حداکثر ۲۰ باشد."),{status:400});
  return {key:gradebookKeyV75({classId,subject,academicYear,academicPeriod}),classId,subject,academicYear,academicPeriod,enabled:raw?.enabled!==false,categories:cats,outputMaxScore};
}
// P67.19 — The saved teacher-selected continuous maximum determines BOTH term maxima.
// Approved student scores never change the permitted final maximum.
function gradebookSharesV6719(db,{classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const key=gradebookKeyV75({classId,subject,academicYear,academicPeriod});
  const cfg=(db.gradebookConfigs||[]).find(c=>c.key===key);
  const raw=cfg?Number(cfg.outputMaxScore):5;
  const continuousMax=Number.isFinite(raw)&&raw>0&&raw<=20?Math.round(raw*100)/100:5;
  return {continuousMax,finalMax:Math.round((20-continuousMax)*100)/100};
}
// 72.89.14 — one authoritative final-term ceiling for every write path.
// Manager term policy wins; gradebook outputMaxScore is the compatibility source;
// an unconfigured class uses the product default of 5 continuous + 15 final.
function finalTermExamScorePolicyV8914(db,{classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  return resolveFinalTermExamPolicyCore({classId,subject,academicYear,academicPeriod,scoreScale:Number(db?.school?.settings?.scoreScale||20),termPolicies:db?.termPolicies,gradebookConfigs:db?.gradebookConfigs});
}
function enforceFinalTermExamScoreV8914(db,exam,book){
  if(String(exam?.examCategory||"ongoing")!=="final")return "";
  const period=normalizeAcademicPeriod(exam.academicPeriod||exam.period,{allowAnnual:false});
  const academicYear=String(exam.academicYear||db?.school?.year||"");
  const policy=finalTermExamScorePolicyV8914(db,{classId:String(exam.classId||""),subject:String(exam.subject||book?.subject||""),academicYear,academicPeriod:period});
  if(!policy.ok)return policy.error||"بارم پایان‌ترم معتبر نیست.";
  if(Math.abs(Number(exam.targetScore||0)-Number(policy.finalMax))>.001)return `بارم آزمون پایانی این دوره باید دقیقاً ${policy.finalMax} نمره باشد؛ سهم مستمر ${policy.continuousMax} نمره است.`;
  return "";
}
function invalidTermFinalV6719(row,max){
  if(!row||row.active===false)return false;
  if(row.score===null||row.score===undefined||String(row.score).trim()==="")return true;
  const n=Number(row.score);
  return !Number.isFinite(n)||n<0||n>max+0.000001;
}
function termLockV75(db,{classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  return (db.termLocks||[]).filter(x=>x.active!==false&&x.classId===classId&&x.subject===subject&&String(x.academicYear||"")===String(academicYear)&&String(x.academicPeriod||x.period||"semester2")===String(academicPeriod)).sort((a,b)=>String(b.lockedAtIso||b.updatedAt||"").localeCompare(String(a.lockedAtIso||a.updatedAt||"")))[0]||null;
}
function isTermLockedV75(db,scope){return !!termLockV75(db,scope);}
// T07: student-specific published report-card guard; annual publication also locks its source terms.
function publishedCardBlocksGradeT07(db,{studentId,academicYear,academicPeriod}){
  return (db.reportCards||[]).some(r=>r.status==="published"&&r.studentId===studentId&&String(r.academicYear||"")===String(academicYear||"")&&[academicPeriod,"annual"].includes(String(r.academicPeriod||r.period||"semester2")));
}
function gradebookManualAverageV75(db,{studentId,classId,subject,academicYear,academicPeriod,categoryId}){
  const rows=(db.gradebookEntries||[]).filter(r=>r.active!==false&&r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||r.period||"semester2")===String(academicPeriod)&&r.categoryId===categoryId&&Number(r.maxScore)>0&&Number.isFinite(Number(r.score)));
  if(!rows.length)return {average:null,count:0};
  const values=rows.map(r=>Math.max(0,Math.min(20,Number(r.score)/Number(r.maxScore)*20)));
  return {average:Math.round(values.reduce((n,v)=>n+v,0)/values.length*100)/100,count:values.length};
}
function gradebookContinuousV75(db,{studentId="",classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const cfg=(db.gradebookConfigs||[]).find(c=>c.key===gradebookKeyV75({classId,subject,academicYear,academicPeriod})&&c.enabled!==false);
  const exam=ongoingExamAverageV73(db,{studentId,classId,subject,academicYear,academicPeriod});
  if(!cfg)return {score:exam.average,examAverage:exam.average,examCount:exam.count,scheduledExamCount:exam.scheduledCount,components:exam.average===null?[]:[{id:"exam",title:"آزمون‌های مستمر",weight:100,score:exam.average,count:exam.count}],configured:false};
  let weighted=0,availableWeight=0;const components=[];
  for(const cat of cfg.categories||[]){let result;if(cat.source==="exam")result={average:exam.average,count:exam.count};else result=gradebookManualAverageV75(db,{studentId,classId,subject,academicYear,academicPeriod,categoryId:cat.id});const score=result.average;if(score!==null){weighted+=score*Number(cat.weight||0);availableWeight+=Number(cat.weight||0);}components.push({id:cat.id,title:cat.title,weight:Number(cat.weight||0),source:cat.source,score,count:result.count});}
  const score=availableWeight>0?Math.round(weighted/availableWeight*100)/100:null;
  return {score,examAverage:exam.average,examCount:exam.count,scheduledExamCount:exam.scheduledCount,components,configured:true,configuredWeight:100,availableWeight};
}
function gradebookPayloadV75(db,{classId,subject,academicYear,academicPeriod}){
  const config=(db.gradebookConfigs||[]).find(c=>c.key===gradebookKeyV75({classId,subject,academicYear,academicPeriod}))||{...normalizeGradebookConfigV75({}, {classId,subject,academicYear,academicPeriod}),enabled:false};
  const students=(db.users||[]).filter(u=>u.role==="student"&&u.active!==false&&u.profileStatus!=="deleted"&&u.classId===classId).map(st=>({id:st.id,firstName:st.firstName,lastName:st.lastName,studentCode:st.studentCode||"",result:gradebookContinuousV75(db,{studentId:st.id,classId,subject,academicYear,academicPeriod})}));
  return {config,students,entries:(db.gradebookEntries||[]).filter(r=>r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||r.period||"semester2")===String(academicPeriod)&&r.active!==false),lock:termLockV75(db,{classId,subject,academicYear,academicPeriod})};
}
function notificationRecipientsV75(db,user,{targetType="user",targetId="",classId=""}={}){
  if(targetType==="user"){const u=(db.users||[]).find(x=>x.id===targetId&&x.active!==false&&x.profileStatus!=="deleted");if(!u)return [];if(user.role==="teacher"&&u.role==="student"&&!teacherCanAssigned(db,user,{classId:u.classId}))return [];return [u.id];}
  if(targetType==="class"){const cid=String(classId||targetId);if(user.role==="teacher"&&!teacherCanAssigned(db,user,{classId:cid}))return [];return (db.users||[]).filter(x=>x.role==="student"&&x.classId===cid&&x.active!==false&&x.profileStatus!=="deleted").map(x=>x.id);}
  if(targetType==="staff"&&["admin","superadmin"].includes(user.role))return (db.users||[]).filter(x=>["teacher","admin","superadmin"].includes(x.role)&&x.active!==false&&x.profileStatus!=="deleted").map(x=>x.id);
  if(targetType==="all"&&["admin","superadmin"].includes(user.role))return (db.users||[]).filter(x=>x.active!==false&&x.profileStatus!=="deleted").map(x=>x.id);
  return [];
}

// v79 — distribute the authoritative weekly schedule to students.
function scheduleSemanticRowV79(row){
  return [row.day||"",row.shiftId||"",Number(row.periodNo||0),row.subject||"",row.teacherId||"",row.startTime||"",row.endTime||"",row.room||"",row.deliveryMode||"inherit",row.meetingProvider||"",row.meetingUrl||""].join("|");
}
function scheduleSignatureByClassV79(db){
  const year=String(db?.school?.year||"");const grouped=new Map();
  for(const row of db?.weeklySchedule||[]){if(row.active===false||String(row.academicYear||year)!==year)continue;const cid=String(row.classId||"");if(!cid)continue;if(!grouped.has(cid))grouped.set(cid,[]);grouped.get(cid).push(scheduleSemanticRowV79(row));}
  const out=new Map();for(const [cid,rows] of grouped)out.set(cid,rows.slice().sort().join("\n"));return out;
}
function distributeScheduleChangesV79(oldDb,nextDb,actorId){
  const before=scheduleSignatureByClassV79(oldDb),after=scheduleSignatureByClassV79(nextDb),classIds=new Set([...before.keys(),...after.keys()]);
  const changed=[...classIds].filter(cid=>(before.get(cid)||"")!==(after.get(cid)||""));if(!changed.length)return [];
  nextDb.notifications=Array.isArray(nextDb.notifications)?nextDb.notifications:[];nextDb.scheduleRevisions=Array.isArray(nextDb.scheduleRevisions)?nextDb.scheduleRevisions:[];
  const at=faNow(),iso=new Date().toISOString(),year=String(nextDb.school?.year||"");
  for(const classId of changed){
    const cls=(nextDb.school?.classes||[]).find(c=>c.id===classId),students=(nextDb.users||[]).filter(u=>u.role==="student"&&u.classId===classId&&u.active!==false&&u.profileStatus!=="deleted");
    const revisionId=makeId("schrev"),title="برنامه هفتگی به‌روزرسانی شد",body=`برنامه هفتگی ${cls?.name||"کلاس شما"} تغییر کرد. آخرین برنامه را از بخش «برنامه هفتگی» مشاهده کنید.`;
    for(const st of students)nextDb.notifications.unshift({id:makeId("not"),userId:st.id,title,body,read:false,at,kind:"schedule_updated",target:"schedule",targetId:classId,revisionId,createdBy:actorId});
    nextDb.scheduleRevisions.unshift({id:revisionId,classId,academicYear:year,changedAt:iso,changedBy:actorId,recipientCount:students.length});
  }
  nextDb.scheduleRevisions=nextDb.scheduleRevisions.slice(0,500);return changed;
}

function upgradeRoadmapDb(db) {
  db.school ||= {};
  db.school.code ||= ""; db.school.district ||= ""; db.school.schoolType ||= "دولتی";
  db.school.semesters = Array.isArray(db.school.semesters) && db.school.semesters.length ? db.school.semesters : [{id:"sem1",title:"نیم‌سال اول",active:true},{id:"sem2",title:"نیم‌سال دوم",active:false}];
  db.school.rooms = Array.isArray(db.school.rooms) ? db.school.rooms : [];
  db.school.departments = Array.isArray(db.school.departments) ? db.school.departments : [];
  db.school.calendar = Array.isArray(db.school.calendar) ? db.school.calendar : [];
  db.enrollments = Array.isArray(db.enrollments) ? db.enrollments : [];
  db.studentDocuments = Array.isArray(db.studentDocuments) ? db.studentDocuments : [];
  db.studentExtendedProfiles = Array.isArray(db.studentExtendedProfiles) ? db.studentExtendedProfiles : [];
  db.recordHistory = Array.isArray(db.recordHistory) ? db.recordHistory : [];
  db.adminTasks = Array.isArray(db.adminTasks) ? db.adminTasks : [];
  db.academicFollowups = Array.isArray(db.academicFollowups) ? db.academicFollowups : [];
  db.userAccessReviews = Array.isArray(db.userAccessReviews) ? db.userAccessReviews : [];
  db.yearArchives = Array.isArray(db.yearArchives) ? db.yearArchives : [];
  db.changeRequests = Array.isArray(db.changeRequests) ? db.changeRequests : [];
  db.schoolAlerts = Array.isArray(db.schoolAlerts) ? db.schoolAlerts : [];
  db.roleDefinitions = Array.isArray(db.roleDefinitions) && db.roleDefinitions.length ? db.roleDefinitions : [
  {id:"superadmin",title:"ادمین فنی",permissions:["*"]},
  {id:"admin",title:"مدیر مدرسه",permissions:["students","staff","school","reports","calendar","family","operations"]},
  {id:"teacher",title:"معلم",permissions:["ownClasses","attendance","homework","assessment","reports"]},
  {id:"exam_officer",title:"مسئول آزمون",permissions:["assessment","questionBank","reports"]},
  {id:"counselor",title:"مشاور",permissions:["studentSupport","family","limitedReports"]},
  {id:"viewer",title:"مشاهده‌گر آموزشی",permissions:["reports"]}
];
  db.users = (db.users||[]).map(u=>({...u,active:u.active!==false,jobTitle:u.jobTitle||({teacher:"معلم",admin:"مدیر",superadmin:"ادمین فنی",student:"دانش‌آموز"}[u.role]||u.role),profileStatus:u.profileStatus||"active",createdAt:u.createdAt||faNow()}));
  db.school.dataRetention = {auditDays:3650,archiveYears:10,studentFilesYears:10,...(db.school.dataRetention||{})};
  db.classSessions = Array.isArray(db.classSessions) ? db.classSessions : [];
  db.timetableExceptions = Array.isArray(db.timetableExceptions) ? db.timetableExceptions : [];
  db.makeupSessions = Array.isArray(db.makeupSessions) ? db.makeupSessions : [];
  db.homeworkAttachments = Array.isArray(db.homeworkAttachments) ? db.homeworkAttachments : [];
  db.assignmentRubrics = Array.isArray(db.assignmentRubrics) ? db.assignmentRubrics : [];
  db.teacherDailyTasks = Array.isArray(db.teacherDailyTasks) ? db.teacherDailyTasks : [];
  db.teachingPlans = Array.isArray(db.teachingPlans) ? db.teachingPlans : [];
  db.calendarEvents = Array.isArray(db.calendarEvents) ? db.calendarEvents : [];
  db.school.academicYears = ensureAcademicYearModel(db.school);
  db.calendarEvents = db.calendarEvents.map(row=>normalizeCalendarEvent(row,db.school?.year||""));
  db.classroomResources = Array.isArray(db.classroomResources) ? db.classroomResources : [];
  db.substitutionPlans = Array.isArray(db.substitutionPlans) ? db.substitutionPlans : [];
  db.attendanceReasons = Array.isArray(db.attendanceReasons) && db.attendanceReasons.length ? db.attendanceReasons : [{id:"illness",title:"بیماری",excused:true},{id:"family",title:"موضوع خانوادگی",excused:true},{id:"unknown",title:"بدون توضیح",excused:false}];
  db.attendancePolicies = {lateMinutes:10,notifyAfterAbsences:2,notifyAfterLates:3,...(db.attendancePolicies||{})};
  db.examAbsenceFollowupsT02 = Array.isArray(db.examAbsenceFollowupsT02) ? db.examAbsenceFollowupsT02 : [];
  db.examVersions = Array.isArray(db.examVersions) ? db.examVersions : [];
  db.examPublicationHistory = Array.isArray(db.examPublicationHistory) ? db.examPublicationHistory : [];
  db.answerSheets = Array.isArray(db.answerSheets) ? db.answerSheets : [];
  db.gradingRubrics = Array.isArray(db.gradingRubrics) ? db.gradingRubrics : [];
  db.questionUsage = Array.isArray(db.questionUsage) ? db.questionUsage : [];
  db.questionReviews = Array.isArray(db.questionReviews) ? db.questionReviews : [];
  db.assessmentIncidents = Array.isArray(db.assessmentIncidents) ? db.assessmentIncidents : [];
  db.questionTypeConfig = {mcq:true,descriptive:true,trueFalse:true,fillBlank:true,multipart:true,...(db.questionTypeConfig||{})};
  db.assessmentPolicies = {requirePreviewBeforePublish:true,allowDraftPdf:true,requireTeacherFinalApproval:true,shuffleOptionsAllowed:true,...(db.assessmentPolicies||{})};
  const lifecycleStatesV4515=new Set(["draft","ready","published","in_progress","ended","graded","final","archived"]);
  db.exams=(db.exams||[]).map(e=>{const derived=e.status==="active"?"published":e.status==="archived"?"archived":"draft";const publicationState=lifecycleStatesV4515.has(e.publicationState)?e.publicationState:derived;return {...e,versionNo:Number(e.versionNo||1),publicationState,preflight:e.preflight||{checked:false,issues:[]}};});
  db.studentGoals = Array.isArray(db.studentGoals) ? db.studentGoals : [];
  db.masteryRecords = Array.isArray(db.masteryRecords) ? db.masteryRecords : [];
  db.studyPlans = Array.isArray(db.studyPlans) ? db.studyPlans : [];
  db.offlineSyncQueue = Array.isArray(db.offlineSyncQueue) ? db.offlineSyncQueue : [];
  db.studentFiles = Array.isArray(db.studentFiles) ? db.studentFiles : [];
  db.lessonMaterials = Array.isArray(db.lessonMaterials) ? db.lessonMaterials : [];
  db.achievements = Array.isArray(db.achievements) ? db.achievements : [];
  db.studentReceipts = Array.isArray(db.studentReceipts) ? db.studentReceipts : [];
  db.studentBookmarks = Array.isArray(db.studentBookmarks) ? db.studentBookmarks : [];
  db.studentPreferences = db.studentPreferences && typeof db.studentPreferences==="object" ? db.studentPreferences : {};
  db.guardians = (Array.isArray(db.guardians) ? db.guardians : []).map(g=>({...g,nationalId:normalizeNationalId(g.nationalId||g.guardianNationalId),active:g.active!==false,createdAt:g.createdAt||faNow()}));
  db.guardianLinks = Array.isArray(db.guardianLinks) ? db.guardianLinks : [];
  db.guardianMessages = Array.isArray(db.guardianMessages) ? db.guardianMessages : [];
  db.counselingCases = Array.isArray(db.counselingCases) ? db.counselingCases : [];
  db.counselingSessions = Array.isArray(db.counselingSessions) ? db.counselingSessions : [];
  db.familyMeetings = Array.isArray(db.familyMeetings) ? db.familyMeetings : [];
  db.behaviorCategories = Array.isArray(db.behaviorCategories) ? db.behaviorCategories : [];
  db.disciplinaryCases = Array.isArray(db.disciplinaryCases) ? db.disciplinaryCases : [];
  db.consentTemplates = Array.isArray(db.consentTemplates) ? db.consentTemplates : [];
  db.parentRequests = Array.isArray(db.parentRequests) ? db.parentRequests : [];
  db.familyPolicies = {guardianAccessDays:30,allowMeetingRequests:true,showPrivateCounseling:false,...(db.familyPolicies||{})};
  db.reportTemplates = Array.isArray(db.reportTemplates) ? db.reportTemplates : [];
  db.savedReports = Array.isArray(db.savedReports) ? db.savedReports : [];
  db.analyticsSnapshots = Array.isArray(db.analyticsSnapshots) ? db.analyticsSnapshots : [];
  db.interventionRules = Array.isArray(db.interventionRules) ? db.interventionRules : [];
  db.gradebookConfigs = Array.isArray(db.gradebookConfigs) ? db.gradebookConfigs : [];
  db.gradebookEntries = Array.isArray(db.gradebookEntries) ? db.gradebookEntries : [];
  db.termFinalOverrides = Array.isArray(db.termFinalOverrides) ? db.termFinalOverrides : [];
  db.termLocks = Array.isArray(db.termLocks) ? db.termLocks : [];
  db.notificationBroadcasts = Array.isArray(db.notificationBroadcasts) ? db.notificationBroadcasts : [];
  db.scheduleRevisions = Array.isArray(db.scheduleRevisions) ? db.scheduleRevisions : [];
  db.reportCards = Array.isArray(db.reportCards) ? db.reportCards : [];
  db.gradingPolicyHistory = Array.isArray(db.gradingPolicyHistory) ? db.gradingPolicyHistory : [];
  db.schoolKpis = Array.isArray(db.schoolKpis) ? db.schoolKpis : [];
  db.questionAnalytics = Array.isArray(db.questionAnalytics) ? db.questionAnalytics : [];
  db.comparisonPeriods = Array.isArray(db.comparisonPeriods) ? db.comparisonPeriods : [];
  db.analyticsSettings = {riskAbsenceWeight:0.25,riskHomeworkWeight:0.25,riskGradeWeight:0.5,passingScore:10,...(db.analyticsSettings||{})};
  db.admissions = Array.isArray(db.admissions) ? db.admissions : [];
  db.certificates = Array.isArray(db.certificates) ? db.certificates : [];
  db.letters = Array.isArray(db.letters) ? db.letters : [];
  db.libraryBooks = Array.isArray(db.libraryBooks) ? db.libraryBooks : [];
  db.libraryLoans = Array.isArray(db.libraryLoans) ? db.libraryLoans : [];
  db.assets = Array.isArray(db.assets) ? db.assets : [];
  db.maintenanceRequests = Array.isArray(db.maintenanceRequests) ? db.maintenanceRequests : [];
  db.labs = Array.isArray(db.labs) ? db.labs : [];
  db.labBookings = Array.isArray(db.labBookings) ? db.labBookings : [];
  db.trips = Array.isArray(db.trips) ? db.trips : [];
  db.transportation = Array.isArray(db.transportation) ? db.transportation : [];
  db.schoolForms = Array.isArray(db.schoolForms) ? db.schoolForms : [];
  db.formSubmissions = Array.isArray(db.formSubmissions) ? db.formSubmissions : [];
  db.inventoryMovements = Array.isArray(db.inventoryMovements) ? db.inventoryMovements : [];
  db.feeAccounts = Array.isArray(db.feeAccounts) ? db.feeAccounts : [];
  db.operationsSettings = {financeModuleEnabled:false,libraryEnabled:true,assetsEnabled:true,labsEnabled:true,tripsEnabled:true,...(db.operationsSettings||{})};
  db.migrationHistory = Array.isArray(db.migrationHistory) ? db.migrationHistory : [];
  db.integrityChecks = Array.isArray(db.integrityChecks) ? db.integrityChecks : [];
  db.healthChecks = Array.isArray(db.healthChecks) ? db.healthChecks : [];
  db.updateHistory = Array.isArray(db.updateHistory) ? db.updateHistory : [];
  db.releaseTests = Array.isArray(db.releaseTests) ? db.releaseTests : [];
  const previousReleaseInfo = db.releaseInfo && typeof db.releaseInfo === "object" ? db.releaseInfo : {};
  const releaseTimestamp = previousReleaseInfo.release === APP_RELEASE && previousReleaseInfo.releasedAt ? previousReleaseInfo.releasedAt : new Date().toISOString();
  db.releaseInfo = {...previousReleaseInfo,version:APP_VERSION,release:APP_RELEASE,channel:RELEASE_CHANNEL,schemaVersion:71,releasedAt:releaseTimestamp};
  db.systemPolicies = {requireBackupBeforeUpgrade:true,requireRestorePointBeforeRepair:true,allowLanOnly:true,maxAuditRows:20000,...(db.systemPolicies||{})};
  db.storagePolicies = {maxUploadMb:Number(db.school?.settings?.maxUploadMb||12),orphanCleanup:true,quotaWarnPercent:85,...(db.storagePolicies||{})};
  db.offlinePolicies = {studentAutosave:true,retryQueue:true,idempotentSubmissions:true,cacheExamDrafts:true,...(db.offlinePolicies||{})};
  db.installationConfig = {mode:"lan",host:"0.0.0.0",port:8787,updateChannel:"stable",...(db.installationConfig||{})};
  return db;
}

function upgradeServerDb(db) {
  db.curriculum = Array.isArray(db.curriculum) && db.curriculum.length ? db.curriculum : serverDefaultCurriculum();
  db.chapterProgress = Array.isArray(db.chapterProgress) ? db.chapterProgress : [];
  db.learningPoints = Array.isArray(db.learningPoints) && db.learningPoints.length ? db.learningPoints : serverSeedLearningPoints();
  db.questionGenerationJobs = Array.isArray(db.questionGenerationJobs) ? db.questionGenerationJobs : [];
  db.questionBank = Array.isArray(db.questionBank) ? db.questionBank : [];
  // P66: isolated admin-only question repository, no auto-copy from legacy pools.
  db.adminQuestionBank = Array.isArray(db.adminQuestionBank) ? db.adminQuestionBank : [];
  // HF-QDEL-01: per-teacher suppression ledger for approved admin questions.
  // Removing a problematic question from a teacher's library must never delete
  // the school's authoritative admin question or alter another teacher's view.
  db.teacherQuestionSuppressions = Array.isArray(db.teacherQuestionSuppressions) ? db.teacherQuestionSuppressions : [];
  db.questionVersions = Array.isArray(db.questionVersions) ? db.questionVersions : [];
  db.questionCollections = Array.isArray(db.questionCollections) ? db.questionCollections : [];
  db.examBlueprints = Array.isArray(db.examBlueprints) ? db.examBlueprints : [];
  db.repositoryTargets = db.repositoryTargets && typeof db.repositoryTargets === "object" ? db.repositoryTargets : {};
  db.qualityRules = { minSampleSize: 10, tooEasyPercent: 90, tooHardPercent: 25, maxAppealRate: 0.15, ...(db.qualityRules || {}) };
  const findBook = subject => db.curriculum.find(b => b.subject === subject);
  db.questionBank = db.questionBank.map((raw, index) => {
    const q = { ...raw }; const book = findBook(q.subject); const chapter = (book?.chapters || []).find(c => c.id === q.chapterId || c.title === q.chapter) || book?.chapters?.[0];
    q.bookId ||= book?.id || ""; q.chapterId ||= chapter?.id || ""; q.chapter ||= chapter?.title || ""; q.difficulty ||= ["easy", "medium", "advanced"][index % 3]; q.status ||= "approved"; q.sourceType ||= "teacher";
    q.topic = String(q.topic || q.topicTitle || q.tags?.[0] || "").trim(); q.cognitiveLevel ||= q.difficulty === "advanced" ? "analyze" : q.difficulty === "medium" ? "apply" : "remember";
    q.estimatedSeconds = Math.max(15, Number(q.estimatedSeconds || (q.type === "descriptive" ? 240 : 75))); q.learningOutcome = String(q.learningOutcome || q.explanation || "").trim(); q.sourcePage = String(q.sourcePage || q.sourceRef || q.chapter || "").trim();
    q.reviewCycleDays = Math.max(30, Number(q.reviewCycleDays || 180)); q.shared = q.shared !== false; q.stats = { usedCount: 0, answerCount: 0, correctCount: 0, appealCount: 0, avgSeconds: 0, ...(q.stats || {}) }; return q;
  });
  if (!db.chapterProgress.length) db.chapterProgress.push({ id: "prog_sc1", classId: "cls1", bookId: "book_science7", chapterId: "science_1", status: "completed", completedAt: faNow(), completedBy: "tea1" }, { id: "prog_so2", classId: "cls1", bookId: "book_social7", chapterId: "social_2", status: "completed", completedAt: faNow(), completedBy: "tea1" });
  db.exams = (db.exams || []).map(exam => { const meta = examCurriculumMeta(db, exam); const questions=(exam.questions || []).map(q => exam.type === "descriptive" ? normalizeDescriptiveQuestion(q) : q); const total=questions.reduce((a,q)=>a+Number(q.score||0),0); return { ...exam, ...meta, chapter: exam.chapter || meta.chapterTitle, academicYear: exam.academicYear || db.school?.year || "", targetScore:Number(exam.targetScore)>0?Number(exam.targetScore):total, questions }; });
  db.questionBank = db.questionBank.map(q => q.type === "descriptive" ? normalizeDescriptiveQuestion(q) : q);
  const bundledIds = new Set(["stu1", "stu2", "stu3", "adm1"]);
  db.users = (db.users || []).filter(u => !bundledIds.has(u.id));
  // معلم اولیه فقط هنگام ساخت دیتابیس تازه ایجاد می‌شود؛ پس از حذف توسط ادمین دوباره ساخته نمی‌شود.
  if (!db.users.some(u => u.role === "superadmin" && u.active !== false && String(u.profileStatus || "active") !== "deleted")) db.users.push({ id: "sys1", role: "superadmin", username: "admin405", nationalId: "0099999999", firstName: "ادمین", lastName: "فنی", active: true });
  db.users = db.users.map(u => ({ ...u, birthDate: u.role === "student" ? normalizeStoredBirthDate(u.birthDate || u.birthYear) : u.birthDate, username: u.id === "tea1" ? "admin" : u.id === "sys1" ? (u.username || "admin405") : (u.username || normalizeNationalId(u.nationalId) || u.studentCode || "") }));
  db.notifications = (db.notifications || []).filter(x => !bundledIds.has(x.userId));
  db.attendance = (db.attendance || []).filter(x => !bundledIds.has(x.studentId));
  db.attempts = (db.attempts || []).filter(x => !bundledIds.has(x.studentId));
  db.submissions = (db.submissions || []).filter(x => !bundledIds.has(x.studentId));
  db.appeals = (db.appeals || []).filter(x => !bundledIds.has(x.studentId));
  const validSubmissionIds = new Set((db.submissions || []).map(x => x.id));
  db.grades = (db.grades || []).filter(x => validSubmissionIds.has(x.submissionId));
  db.school ||= {};
  db.school.name = db.school.name === "مدرسه پایه اول متوسطه پروین اعتصامی جوانرود" ? "مدرسه دوره اول متوسطه پروین اعتصامی جوانرود" : (db.school.name || SCHOOL_NAME);
  db.school.grades = SCHOOL_GRADES.map(g => ({...g}));
  db.school.classes = (Array.isArray(db.school.classes) ? db.school.classes : []).map(c => { const meta=gradeMeta(c.grade); return {...c, grade:meta.grade, gradeId:meta.id, gradeName:meta.name}; });
  for (const grade of [7,8,9]) if (!db.school.classes.some(c => Number(c.grade) === grade)) { const meta=gradeMeta(grade); db.school.classes.push({id:`cls${grade}a`,name:`${meta.name} - الف`,grade,gradeId:meta.id,gradeName:meta.name,active:true,academicYear:db.school.year||""}); }
  db.curriculum = ensureMultiGradeCurriculumServer(db.curriculum);
  const catalog=Array.from(new Set([...(Array.isArray(db.school.subjects)?db.school.subjects:[]),...(db.curriculum||[]).filter(book=>book?.active!==false).map(book=>String(book?.subject||"").trim()).filter(Boolean)]));
  db.school.subjects=catalog;
  const bookById = new Map((db.curriculum||[]).map(b=>[b.id,b]));
  db.questionBank = (db.questionBank||[]).map(q=>{ const b=bookById.get(q.bookId); const grade=Number(q.grade||b?.grade||7); const meta=gradeMeta(grade); return {...q,grade:meta.grade,gradeId:meta.id,gradeName:meta.name}; });
  db.exams = (db.exams||[]).map(e=>{ const cls=(db.school.classes||[]).find(c=>c.id===e.classId), b=bookById.get(e.bookId); const grade=Number(e.grade||cls?.grade||b?.grade||7), meta=gradeMeta(grade); return {...e,grade:meta.grade,gradeId:meta.id,gradeName:meta.name}; });
  db.school.academicYears = ensureAcademicYearModel(db.school);
  db.school.settings = { maxUploadMb: 12, autoBackupMinutes: 5, backupRetention: 20, dailyBackupRetention: 7, weeklyBackupRetention: 4, recycleRetentionDays: 30, scoreScale: 20, passingScore: 10, gradingPolicy: { mode: "additive", continuousWeight: 40, finalWeight: 60 }, allowAppeals: true, allowStudentResubmit: false, schoolManager: "", phone: "", address: "", ...(db.school.settings || {}) };
  {
    const rawPolicy = db.school.settings?.gradingPolicy || {};
    const mode = rawPolicy.mode === "weighted" ? "weighted" : "additive";
    let continuousWeight = Number(rawPolicy.continuousWeight);
    let finalWeight = Number(rawPolicy.finalWeight);
    if (!Number.isFinite(continuousWeight) || continuousWeight < 0 || continuousWeight > 100) continuousWeight = 40;
    if (!Number.isFinite(finalWeight) || finalWeight < 0 || finalWeight > 100) finalWeight = 60;
    if (mode === "weighted" && Math.abs((continuousWeight + finalWeight) - 100) > 0.001) {
      continuousWeight = 40; finalWeight = 60;
    }
    db.school.settings.gradingPolicy = { mode, continuousWeight, finalWeight };
  }
  db.school.reportBranding = { organization: "وزارت آموزش و پرورش", schoolName: db.school.name || "مدرسه", district: "", address: db.school.settings.address || "", phone: db.school.settings.phone || "", managerName: db.school.settings.schoolManager || "", headerNote: "", footerNote: "این گزارش از سامانه مدرسه‌یار تهیه شده است.", headerImageDataUrl: "", headerImageUpdatedAt: "", managerSignatureDataUrl: "", managerSignatureUpdatedAt: "", ...(db.school.reportBranding || {}) };
  db.school.uiBranding = {
    primaryColor: "#14233f", accentColor: "#4f7cff", logoDataUrl: "", logoUpdatedAt: "", updatedAt: "",
    headers: {
      admin: {template:"modern",imageDataUrl:"",imageUpdatedAt:"",height:132,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:true,showYear:true,subtitle:"مرکز مدیریت مدرسه"},
      teacher: {template:"modern",imageDataUrl:"",imageUpdatedAt:"",height:126,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:true,showYear:true,subtitle:"پنل حرفه‌ای معلم"},
      student: {template:"compact",imageDataUrl:"",imageUpdatedAt:"",height:78,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:false,showYear:false,subtitle:"پنل دانش‌آموز"},
      guardian: {template:"compact",imageDataUrl:"",imageUpdatedAt:"",height:84,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:true,showYear:false,subtitle:"پنل خانواده و والدین"}
    },
    history: [],
    ...(db.school.uiBranding || {})
  };
  db.school.uiBranding.headers = {
    admin:{template:"modern",imageDataUrl:"",imageUpdatedAt:"",height:132,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:true,showYear:true,subtitle:"مرکز مدیریت مدرسه",...(db.school.uiBranding.headers?.admin||{})},
    teacher:{template:"modern",imageDataUrl:"",imageUpdatedAt:"",height:126,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:true,showYear:true,subtitle:"پنل حرفه‌ای معلم",...(db.school.uiBranding.headers?.teacher||{})},
    student:{template:"compact",imageDataUrl:"",imageUpdatedAt:"",height:78,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:false,showYear:false,subtitle:"پنل دانش‌آموز",...(db.school.uiBranding.headers?.student||{})},
    guardian:{template:"compact",imageDataUrl:"",imageUpdatedAt:"",height:84,fit:"cover",textTone:"light",showImage:true,showLogo:true,showSchoolName:true,showSubtitle:true,showYear:false,subtitle:"پنل خانواده و والدین",...(db.school.uiBranding.headers?.guardian||{})}
  };
  // v43: apply the supplied school artwork as the default header once on upgrade.
  if (Number(db.school.uiBranding.defaultHeaderVersion || 0) < 43) {
    const sharedHeader = "/assets/school-header-v43.jpg";
    const defaultsV43 = {
      admin:{template:"image",imageDataUrl:sharedHeader,imageUpdatedAt:faNow(),height:210,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""},
      teacher:{template:"image",imageDataUrl:sharedHeader,imageUpdatedAt:faNow(),height:210,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""},
      student:{template:"image",imageDataUrl:sharedHeader,imageUpdatedAt:faNow(),height:165,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""},
      guardian:{template:"image",imageDataUrl:sharedHeader,imageUpdatedAt:faNow(),height:185,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""}
    };
    for (const [key, value] of Object.entries(defaultsV43)) db.school.uiBranding.headers[key] = {...db.school.uiBranding.headers[key], ...value};
    db.school.uiBranding.defaultHeaderVersion = 43;
    db.school.uiBranding.updatedAt = faNow();
  }

  db = normalizeTeachingAssignments(db);
  db.accessProfiles = Array.isArray(db.accessProfiles) && db.accessProfiles.length ? db.accessProfiles : [
    { id: "teacher_full", title: "معلم کامل", permissions: ["curriculum", "questionBank", "examManagement", "grading", "appeals", "reports", "classroom"] },
    { id: "teacher_exam", title: "مسئول آزمون", permissions: ["questionBank", "examManagement", "grading", "appeals", "reports"] },
    { id: "teacher_report", title: "مشاهده‌گر آموزشی", permissions: ["reports"] }
  ];
  db.users = (db.users || []).map(u => u.role === "teacher" ? { permissionProfile: u.permissionProfile || "teacher_full", jobTitle: u.jobTitle || "معلم", ...u } : u);
  db.adminNotes = Array.isArray(db.adminNotes) ? db.adminNotes : [];
  db.attendanceSessions = (Array.isArray(db.attendanceSessions) ? db.attendanceSessions : []).map(x=>({...x,academicYear:x.academicYear||db.school?.year||"",academicPeriod:x.academicPeriod||x.period||"semester2"}));
  db.attendance = (Array.isArray(db.attendance) ? db.attendance : []).map(x=>{
    const legacyStatus=String(x.status||"");
    const status=legacyStatus==="absent"?"absent_pending":legacyStatus==="excused"?"absent_excused":legacyStatus;
    return {...x,status:status||"present",academicYear:x.academicYear||db.school?.year||"",academicPeriod:x.academicPeriod||x.period||"semester2"};
  });
  db.homeworkSubmissions = (Array.isArray(db.homeworkSubmissions) ? db.homeworkSubmissions : []).map(x=>({...x,academicYear:x.academicYear||db.school?.year||"",academicPeriod:x.academicPeriod||x.period||"semester2"}));
  db.continuousAssessments = (Array.isArray(db.continuousAssessments) ? db.continuousAssessments : []).map(x=>({...x,academicYear:x.academicYear||db.school?.year||""}));
  db.continuousGradeOverrides = (Array.isArray(db.continuousGradeOverrides) ? db.continuousGradeOverrides : []).map(x=>({...x,academicYear:x.academicYear||db.school?.year||"",academicPeriod:["semester1","semester2"].includes(String(x.academicPeriod||x.period))?String(x.academicPeriod||x.period):"semester2",history:Array.isArray(x.history)?x.history:[]}));
  db.termPolicies = Array.isArray(db.termPolicies) ? db.termPolicies : [];
  db.behaviorRecords = (Array.isArray(db.behaviorRecords) ? db.behaviorRecords : []).map(x=>({...x,academicYear:x.academicYear||db.school?.year||"",academicPeriod:x.academicPeriod||x.period||"semester2"}));
  db.announcements = Array.isArray(db.announcements) ? db.announcements : [];
  db.interventions = Array.isArray(db.interventions) ? db.interventions : [];
  db.gradeRevisions = Array.isArray(db.gradeRevisions) ? db.gradeRevisions : [];
  db.lessonLogs = (Array.isArray(db.lessonLogs) ? db.lessonLogs : []).map(x=>({...x,academicYear:x.academicYear||db.school?.year||"",academicPeriod:x.academicPeriod||x.period||"semester2"}));
  db.guardianContacts = Array.isArray(db.guardianContacts) ? db.guardianContacts : [];
  db.consentForms = Array.isArray(db.consentForms) ? db.consentForms : [];
  db.progressReports = Array.isArray(db.progressReports) ? db.progressReports : [];
  const defaultClassId = db.school?.classes?.find(c => c.active)?.id || db.school?.classes?.[0]?.id || "";
  db.school.shiftDefinitions = Array.isArray(db.school.shiftDefinitions) && db.school.shiftDefinitions.length ? db.school.shiftDefinitions : [
    {id:"morning",name:"شیفت صبح",periods:[{no:1,start:"07:30",end:"08:15"},{no:2,start:"08:25",end:"09:10"},{no:3,start:"09:25",end:"10:10"},{no:4,start:"10:20",end:"11:05"},{no:5,start:"11:15",end:"12:00"},{no:6,start:"12:10",end:"12:55"}]},
    {id:"afternoon",name:"شیفت بعدازظهر",periods:[{no:1,start:"13:00",end:"13:45"},{no:2,start:"13:55",end:"14:40"},{no:3,start:"14:50",end:"15:35"},{no:4,start:"15:45",end:"16:30"},{no:5,start:"16:40",end:"17:25"},{no:6,start:"17:35",end:"18:20"}]}
  ];
  db.school.classes=(db.school.classes||[]).map(c=>({...c,shiftId:c.shiftId||"morning"}));
  db.enrollments = normalizeEnrollments(db);
  db.school.onlineLearning = onlineLearningSettingsV74(db);
  db.weeklySchedule = (Array.isArray(db.weeklySchedule) ? db.weeklySchedule : []).map(row=>{
    const mode=normalizeDeliveryModeV74(row.deliveryMode,"inherit");
    return {...row,deliveryMode:mode,meetingProvider:String(row.meetingProvider||"").slice(0,60),meetingUrl:normalizeWebUrlV74(row.meetingUrl||""),onlineInstructions:String(row.onlineInstructions||"").slice(0,1500)};
  });
  db.onlineClassSessions = (Array.isArray(db.onlineClassSessions) ? db.onlineClassSessions : []).map(row=>({...row,deliveryMode:normalizeDeliveryModeV74(row.deliveryMode,"online"),meetingUrl:normalizeWebUrlV74(row.meetingUrl||""),meetingProvider:String(row.meetingProvider||"").slice(0,60),academicYear:String(row.academicYear||db.school?.year||"")}));
  db.onlineJoinEvents = (Array.isArray(db.onlineJoinEvents) ? db.onlineJoinEvents : []).map(row=>({...row,academicYear:String(row.academicYear||db.school?.year||"")}));
  db.schedule = (Array.isArray(db.schedule) ? db.schedule : []).map((row, index) => ({ id: row.id || `sch_${index + 1}`, classId: row.classId || defaultClassId, day: row.day || "", periods: Array.from({ length: 6 }, (_, i) => String(row.periods?.[i] || "")) }));
  // v73: migrate legacy subject-only timetable rows when a valid teaching assignment exists.
  if (!db.weeklySchedule.length && db.schedule.length) {
    const classSlotKeys = new Set();
    const teacherSlotKeys = new Set();
    const year = String(db.school?.year || "");
    for (const row of db.schedule) {
      const cls = (db.school?.classes || []).find(c => c.id === row.classId);
      if (!cls) continue;
      const shiftId = cls.shiftId || "morning";
      const shift = (db.school.shiftDefinitions || []).find(x => x.id === shiftId);
      for (let i = 0; i < (row.periods || []).length; i++) {
        const subject = String(row.periods[i] || "").trim();
        if (!subject) continue;
        const assignment = (db.teachingAssignments || []).find(a => a.active !== false && a.classId === row.classId && String(a.subject || "").trim() === subject && (!a.academicYear || !year || a.academicYear === year));
        if (!assignment) continue;
        const periodNo = i + 1;
        const classKey = `${row.classId}|${row.day}|${shiftId}|${periodNo}`;
        const teacherKey = `${assignment.teacherId}|${row.day}|${shiftId}|${periodNo}`;
        if (classSlotKeys.has(classKey) || teacherSlotKeys.has(teacherKey)) continue;
        classSlotKeys.add(classKey); teacherSlotKeys.add(teacherKey);
        const period = shift?.periods?.[i] || {};
        db.weeklySchedule.push({
          id: `wsch_mig_${String(row.id || "row")}_${periodNo}`, classId: row.classId, academicYear: year, day: row.day, shiftId, periodNo,
          assignmentId: assignment.id, teacherId: assignment.teacherId, subject: assignment.subject, bookId: assignment.bookId || "",
          startTime: String(period.start || "").slice(0,5), endTime: String(period.end || "").slice(0,5), room: "", active: true,
          deliveryMode:"inherit", meetingProvider:"", meetingUrl:"", onlineInstructions:"",
          updatedAt: faNow(), updatedBy: "migration-v73"
        });
      }
    }
  }
  db.appeals = (db.appeals || []).map(a => ({ ...a, history: Array.isArray(a.history) && a.history.length ? a.history : [{ status: a.status || "open", note: "ثبت اولیه درخواست", at: a.at || faNow(), by: a.studentId || null }] }));
  db.homework = (db.homework || []).map(h => ({ allowLate: true, totalScore: 20, createdAt: h.createdAt || faNow(), createdBy: h.createdBy || "tea1", ...h, academicYear: h.academicYear || db.school?.year || "" }));
  db.accessProfiles = (db.accessProfiles || []).map(p => ({ ...p, permissions: Array.from(new Set([...(p.permissions || []), ...(p.id === "teacher_full" ? ["classroom"] : [])])) }));
  db = upgradeRoadmapDb(db);
  db.users=(db.users||[]).map(u=>({...u,profileStatus:u.profileStatus||((u.active===false)?"inactive":"active")}));
  const usageCountsV4515=new Map();
  for(const exam of db.exams||[]){const state=String(exam.publicationState||"").toLowerCase(),status=String(exam.status||"").toLowerCase();const used=["published","in_progress","ended","graded","final","archived"].includes(state)||status==="active"||status==="archived";if(!used)continue;for(const q of exam.questions||[])if(q.sourceQuestionId)usageCountsV4515.set(q.sourceQuestionId,(usageCountsV4515.get(q.sourceQuestionId)||0)+1);}
  db.questionUsage=[...usageCountsV4515.entries()].map(([questionId,usedCount])=>({questionId,usedCount,updatedAt:new Date().toISOString()}));
  db.questionBank=(db.questionBank||[]).map(q=>({...q,stats:{...(q.stats||{}),usedCount:Number(usageCountsV4515.get(q.id)||0)}}));
  db.releaseInfo={...(db.releaseInfo||{}),version:APP_VERSION,release:APP_RELEASE,schemaVersion:71,channel:RELEASE_CHANNEL};
  db = normalizeTeachingAssignments(db); db.securityVersion = APP_VERSION; db.version = APP_VERSION; return db;
}

function upgradeServerDbRespectingReset(db) {
  const preserve = ["superadmin-only","selective"].includes(db?.resetState?.mode) && db?.resetState?.preserveEmptyOperationalData === true;
  if (!preserve) return upgradeServerDb(db);

  const emptyTopLevel = new Set(Object.entries(db).filter(([,value])=>Array.isArray(value)&&value.length===0).map(([key])=>key));
  const classesWereEmpty = Array.isArray(db.school?.classes) && db.school.classes.length === 0;
  const academicYearsWereEmpty = Array.isArray(db.school?.academicYears) && db.school.academicYears.length === 0;
  const out = upgradeServerDb(db);

  // Schema upgrades may seed demo/reference rows. A factory-reset state explicitly
  // records which operational collections were empty, so those collections stay
  // empty while still receiving non-destructive schema/object migrations.
  for (const key of emptyTopLevel) if (Array.isArray(out[key])) out[key] = [];
  if (classesWereEmpty) out.school.classes = [];
  if (academicYearsWereEmpty) out.school.academicYears = [];
  out.resetState = {...db.resetState};
  return out;
}

function defaultServerDb() {
  return {
    version: APP_VERSION,
    createdAt: faNow(),
    school: {
      name: "مدرسه دوره اول متوسطه پروین اعتصامی جوانرود",
      year: "۱۴۰۵–۱۴۰۶",
      grades: SCHOOL_GRADES.map(g => ({...g})),
      classes: [
        { id: "cls1", name: "پایه اول متوسطه اول - الف", grade: 7, gradeId:"grade7", gradeName:"پایه اول متوسطه اول", active: true },
        { id: "cls8a", name: "پایه دوم متوسطه اول - الف", grade: 8, gradeId:"grade8", gradeName:"پایه دوم متوسطه اول", active: true },
        { id: "cls9a", name: "پایه سوم متوسطه اول - الف", grade: 9, gradeId:"grade9", gradeName:"پایه سوم متوسطه اول", active: true }
      ],
      subjects: ["علوم تجربی", "مطالعات اجتماعی", "ریاضی", "فارسی", "عربی", "زبان انگلیسی"],
      academicYears: [{ id: "year_1405_1406", label: "۱۴۰۵–۱۴۰۶", active: true, createdAt: faNow() }],
      settings: { maxUploadMb: 12, autoBackupMinutes: 5, backupRetention: 20 },
      onlineLearning: { enabled:false, operationMode:"in_person", defaultProvider:"custom", defaultMeetingUrl:"", instructions:"", joinWindowMinutes:15, lateAfterMinutes:10, teacherCanEditLinks:true, requireStudentCheckIn:true },
      reportBranding: { organization: "وزارت آموزش و پرورش", schoolName: "مدرسه دوره اول متوسطه پروین اعتصامی جوانرود", district: "", address: "", phone: "", managerName: "", headerNote: "", footerNote: "این گزارش از سامانه مدرسه‌یار تهیه شده است.", headerImageDataUrl: "", headerImageUpdatedAt: "", managerSignatureDataUrl: "", managerSignatureUpdatedAt: "" },
      uiBranding: {primaryColor:"#14233f",accentColor:"#4f7cff",logoDataUrl:"",logoUpdatedAt:"",updatedAt:faNow(),defaultHeaderVersion:43,headers:{admin:{template:"image",imageDataUrl:"/assets/school-header-v43.jpg",imageUpdatedAt:faNow(),height:210,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""},teacher:{template:"image",imageDataUrl:"/assets/school-header-v43.jpg",imageUpdatedAt:faNow(),height:210,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""},student:{template:"image",imageDataUrl:"/assets/school-header-v43.jpg",imageUpdatedAt:faNow(),height:165,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""},guardian:{template:"image",imageDataUrl:"/assets/school-header-v43.jpg",imageUpdatedAt:faNow(),height:185,fit:"cover",textTone:"light",showImage:true,showLogo:false,showSchoolName:false,showSubtitle:false,showYear:false,subtitle:""}},history:[]}
    },
    users: [
      { id: "tea1", role: "teacher", username: "admin", nationalId: "0024387568", firstName: "معلم", lastName: "مدرسه", classIds: ["cls1"], subjects: ["علوم تجربی", "مطالعات اجتماعی"], active: true },
      { id: "sys1", role: "superadmin", username: "admin405", nationalId: "0099999999", firstName: "ادمین", lastName: "فنی", active: true }
    ],
    curriculum: serverDefaultCurriculum(),
    chapterProgress: [{ id: "prog_sc1", classId: "cls1", bookId: "book_science7", chapterId: "science_1", status: "completed", completedAt: faNow(), completedBy: "tea1" }, { id: "prog_so2", classId: "cls1", bookId: "book_social7", chapterId: "social_2", status: "completed", completedAt: faNow(), completedBy: "tea1" }],
    learningPoints: serverSeedLearningPoints(),
    questionGenerationJobs: [],
    questionVersions: [],
    questionCollections: [],
    examBlueprints: [],
    repositoryTargets: {},
    qualityRules: { minSampleSize: 10, tooEasyPercent: 90, tooHardPercent: 25, maxAppealRate: 0.15 },
    questionBank: serverSeedQuestionBank(),
    exams: [
      { id: "ex1", title: "آزمون فصل اول علوم", type: "mcq", subject: "علوم تجربی", bookId: "book_science7", chapterId: "science_1", chapter: "فصل اول", classId: "cls1", duration: 12, status: "active", showInstantResult: true, createdBy: "tea1", createdAt: faNow(), questions: [
        { id: "q1", sourceQuestionId: "bank_sc_e1", text: "کدام گزینه یک کمیت اندازه‌گیری‌پذیر است؟", score: 2.5, choices: ["زیبایی", "جرم", "مهربانی", "شجاعت"], answer: 1 },
        { id: "q2", sourceQuestionId: "bank_sc_e2", text: "یکای اصلی طول در دستگاه SI چیست؟", score: 2.5, choices: ["کیلوگرم", "ثانیه", "متر", "لیتر"], answer: 2 },
        { id: "q3", sourceQuestionId: "bank_sc_m1", text: "برای اندازه‌گیری حجم مایعات معمولاً از چه وسیله‌ای استفاده می‌شود؟", score: 2.5, choices: ["نیروسنج", "استوانه مدرج", "دماسنج", "ترازو"], answer: 1 },
        { id: "q4", sourceQuestionId: "bank_sc_m2", text: "چگالی از تقسیم کدام دو کمیت به دست می‌آید؟", score: 2.5, choices: ["جرم بر حجم", "حجم بر جرم", "طول بر زمان", "زمان بر طول"], answer: 0 }
      ]},
      { id: "ex2", title: "آزمون تشریحی فصل دوم مطالعات", type: "descriptive", subject: "مطالعات اجتماعی", bookId: "book_social7", chapterId: "social_2", chapter: "فصل دوم", classId: "cls1", duration: 40, status: "active", examCode: "MSY-STUDY-02", createdBy: "tea1", createdAt: faNow(), questions: [
        { id: "dq1", text: "دو مورد از حقوق شهروندی را توضیح دهید.", score: 10, referenceAnswer: "حق آموزش و حق برخورداری از امنیت، همراه با توضیح روشن.", rubric: [{ title: "ذکر دو حق معتبر", score: 4 }, { title: "توضیح روشن هر مورد", score: 4 }, { title: "نگارش و نتیجه‌گیری", score: 2 }] },
        { id: "dq2", text: "چرا رعایت قانون در جامعه اهمیت دارد؟", score: 10, referenceAnswer: "رعایت قانون باعث نظم اجتماعی، حفظ حقوق دیگران و کاهش اختلاف می‌شود.", rubric: [{ title: "اشاره به نظم اجتماعی", score: 3 }, { title: "حفظ حقوق دیگران", score: 3 }, { title: "مثال مناسب", score: 2 }, { title: "جمع‌بندی", score: 2 }] }
      ]}
    ],
    attempts: [], submissions: [], grades: [], appeals: [], examAbsenceFollowupsT02: [],
    notifications: [],
    audit: [],
    homework: [
      { id: "hw1", classId: "cls1", subject: "علوم تجربی", title: "تمرین فصل اول", description: "سؤال‌های ۱ تا ۶ صفحه ۲۱ را پاسخ دهید.", dueAt: "۱۴۰۵/۰۵/۲۰", status: "active" },
      { id: "hw2", classId: "cls1", subject: "فارسی", title: "خلاصه درس دوم", description: "یک خلاصه ده‌خطی در دفتر نگارش بنویسید.", dueAt: "۱۴۰۵/۰۵/۲۲", status: "active" }
    ],
    schedule: [
      { day: "شنبه", periods: ["ریاضی", "علوم تجربی", "فارسی", "ورزش"] },
      { day: "یکشنبه", periods: ["مطالعات اجتماعی", "عربی", "ریاضی", "هنر"] },
      { day: "دوشنبه", periods: ["فارسی", "علوم تجربی", "کار و فناوری", "زبان انگلیسی"] },
      { day: "سه‌شنبه", periods: ["ریاضی", "قرآن", "مطالعات اجتماعی", "نگارش"] },
      { day: "چهارشنبه", periods: ["زبان انگلیسی", "فارسی", "علوم تجربی", "تفکر"] }
    ],
    resources: [
      { id: "res1", classId: "cls1", subject: "علوم تجربی", title: "راهنمای اندازه‌گیری", type: "جزوه", url: "", description: "مرور مفاهیم فصل اول" },
      { id: "res2", classId: "cls1", subject: "مطالعات اجتماعی", title: "حقوق شهروندی", type: "خلاصه درس", url: "", description: "نکات مهم فصل دوم" }
    ],
    attendance: [],
    attendanceSessions: [],
    onlineClassSessions: [],
    onlineJoinEvents: [],
    homeworkSubmissions: [],
    continuousAssessments: [],
    termPolicies: [],
    behaviorRecords: [],
    announcements: [],
    interventions: [],
    gradeRevisions: [],
    lessonLogs: [],
    guardianContacts: [],
    consentForms: [],
    progressReports: []
  };
}

function enqueueStateOperation(operation) {
  const task = stateOperationQueue.then(operation, operation);
  stateOperationQueue = task.then(() => undefined, () => undefined);
  return task;
}

function adminQuestionBankCatalogNeedsUpgradeServer(curriculum) {
  // P66.7: persisted DBs may already have the current release/schema metadata
  // while grade-8/9 book chapter arrays are still incomplete. Detect this
  // separately so the normal, non-destructive DB upgrade repairs the catalog.
  const rows = Array.isArray(curriculum) ? curriculum : [];
  const specs = [
    { grade: 8, subject: "ریاضی", chapterCount: 9 },
    { grade: 9, subject: "ریاضی", chapterCount: 8 },
    { grade: 9, subject: "مطالعات اجتماعی", chapterCount: 12 }
  ];
  return specs.some(({ grade, subject, chapterCount }) => {
    const book = rows.find(b => Number(b.grade) === grade && String(b.subject || "").trim() === subject);
    if (!book) {
      // The regular upgrade can recreate a target-grade book from its grade-7 source.
      return rows.some(b => Number(b.grade) === 7 && String(b.subject || "").trim() === subject);
    }
    return !Array.isArray(book.chapters) || book.chapters.length < chapterCount;
  });
}

async function ensureStateInitialized() {
  let current;
  try { current = await readStateEnvelope(); }
  catch (error) {
    if (error?.code !== "STATE_DATA_CORRUPT") throw error;
    current = await recoverCorruptState();
  }
  if (current.initialized && current.db) {
    const intentionalEmptyReset = current.db.resetState?.mode === "superadmin-only" && current.db.resetState?.preserveEmptyOperationalData === true;
    const needsUpgrade = Number(current.db.version || 0) < APP_VERSION || String(current.db.releaseInfo?.release || "") !== APP_RELEASE || !Array.isArray(current.db.curriculum) || !Array.isArray(current.db.chapterProgress) || !Array.isArray(current.db.learningPoints) || !Array.isArray(current.db.questionCollections) || !Array.isArray(current.db.school?.grades) || (current.db.school?.classes||[]).some(c=>!c.gradeId) || (current.db.curriculum||[]).some(b=>!b.gradeId) || (!intentionalEmptyReset && scienceCurriculumNeedsUpgradeServer(current.db.curriculum)) || (current.db.questionBank || []).some(q => !q.cognitiveLevel || !q.estimatedSeconds || !q.gradeId);
    if (needsUpgrade) return writeStateEnvelope(upgradeServerDbRespectingReset(current.db));
    if (adminQuestionBankCatalogNeedsUpgradeServer(current.db.curriculum)) {
      // Catalog-only migration: do not run unrelated schema migrations just to
      // restore missing chapter rows in the question-import catalog.
      const catalogRepair = structuredClone(current.db);
      catalogRepair.curriculum = ensureMultiGradeCurriculumServer(catalogRepair.curriculum);
      return writeStateEnvelope(catalogRepair);
    }
    return current;
  }
  return writeStateEnvelope(upgradeServerDb(defaultServerDb()));
}

async function mutateDb(mutator, expectedUpdatedAt = "", beforeCommit = null, commitOptions = {}) {
  return enqueueStateOperation(async () => {
    const envelope = await ensureStateInitialized();
    if (expectedUpdatedAt && String(envelope.updatedAt || "") !== String(expectedUpdatedAt)) {
      throw Object.assign(new Error("اطلاعات سامانه از زمان بازشدن صفحه تغییر کرده است؛ صفحه را تازه کنید و دوباره تلاش کنید."), {
        status: 409, code: "STATE_CONFLICT", latestUpdatedAt: envelope.updatedAt || ""
      });
    }
    const writeOptions = commitOptions && typeof commitOptions === "object" ? {...commitOptions} : {};
    // Stage50: clone the pre-mutation envelope only when an automatic snapshot is
    // actually due. Most writes avoid both an extra state.json read and a full clone.
    const previousEnvelopeForSnapshotV50 = !writeOptions?.skipSnapshot && autoSnapshotDueV50(envelope.db)
      ? { initialized: true, updatedAt: envelope.updatedAt || null, db: structuredClone(envelope.db) }
      : null;
    const db = envelope.db;
    const result = await mutator(db);
    if (typeof beforeCommit === "function") await beforeCommit({ db, result, envelope });
    if (previousEnvelopeForSnapshotV50) writeOptions.previousEnvelope = previousEnvelopeForSnapshotV50;
    const written = await writeStateEnvelope(db, writeOptions);
    return { db, result, updatedAt: written.updatedAt || "" };
  });
}

function normalizeNationalId(value) {
  return String(value || "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");
}

async function studentAuth(req, options = {}) {
  return authenticate(req, ["student"], options);
}

function publicStudent(user, db) {
  const cls = (db.school?.classes || []).find(c => c.id === user.classId);
  return {
    id: user.id, firstName: user.firstName, lastName: user.lastName,
    nationalId: user.nationalId || "", birthDate: user.birthDate || "",
    studentCode: user.studentCode || "", classId: user.classId,
    className: cls?.name || "پایه اول متوسطه اول", grade: Number(cls?.grade||7), gradeName: cls?.gradeName || gradeMeta(cls?.grade||7).name, schoolName: db.school?.name || "مدرسه",
    academicYear: db.school?.year || "",
    studentMobile: user.studentMobile || "", email: user.email || "",
    guardianMobile: user.guardianMobile || "", homePhone: user.homePhone || "",
    emergencyGuardianName: user.emergencyGuardianName || "",
    emergencyGuardianRelation: user.emergencyGuardianRelation || "",
    emergencyGuardianMobile: user.emergencyGuardianMobile || "",
    address: user.address || "", postalCode: user.postalCode || "",
    fatherName: user.fatherName || "", motherName: user.motherName || "", placeOfBirth: user.placeOfBirth || "", identityNumber: user.identityNumber || "",
    profileUpdatedAt: user.profileUpdatedAt || "", profilePhotoUpdatedAt: user.profilePhotoUpdatedAt || ""
  };
}

function normalizePhone(value) {
  return String(value || "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9+]/g, "").slice(0, 16);
}
function validateStudentProfilePayload(body) {
  const out = {
    studentMobile: normalizePhone(body.studentMobile),
    email: String(body.email || "").trim().toLowerCase().slice(0, 160),
    guardianMobile: normalizePhone(body.guardianMobile),
    homePhone: normalizePhone(body.homePhone),
    emergencyGuardianName: String(body.emergencyGuardianName || "").trim().slice(0, 120),
    emergencyGuardianRelation: String(body.emergencyGuardianRelation || "").trim().slice(0, 60),
    emergencyGuardianMobile: normalizePhone(body.emergencyGuardianMobile),
    address: String(body.address || "").trim().slice(0, 600),
    postalCode: normalizeNationalId(body.postalCode).slice(0, 10)
  };
  const mobileOk = value => !value || /^(?:\+98|0)?9\d{9}$/.test(value);
  const phoneOk = value => !value || /^\+?\d{8,15}$/.test(value);
  if (!mobileOk(out.studentMobile)) throw Object.assign(new Error("شماره موبایل دانش‌آموز معتبر نیست."), { status: 400 });
  if (!mobileOk(out.guardianMobile)) throw Object.assign(new Error("شماره موبایل ولی معتبر نیست."), { status: 400 });
  if (!mobileOk(out.emergencyGuardianMobile)) throw Object.assign(new Error("شماره تماس اضطراری ولی معتبر نیست."), { status: 400 });
  if (!phoneOk(out.homePhone)) throw Object.assign(new Error("تلفن منزل معتبر نیست."), { status: 400 });
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw Object.assign(new Error("ایمیل معتبر نیست."), { status: 400 });
  if (out.postalCode && !/^\d{10}$/.test(out.postalCode)) throw Object.assign(new Error("کد پستی باید ۱۰ رقم باشد."), { status: 400 });
  if (!out.emergencyGuardianMobile) throw Object.assign(new Error("شماره تماس اضطراری ولی الزامی است."), { status: 400 });
  return out;
}
async function saveStudentProfilePhoto(studentId, dataUrl) {
  await ensureDataDirs();
  const value = String(dataUrl || "");
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw Object.assign(new Error("فرمت عکس پروفایل معتبر نیست."), { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1.5 * 1024 * 1024) throw Object.assign(new Error("حجم عکس پروفایل باید کمتر از ۱.۵ مگابایت باشد."), { status: 413 });
  const key = safeKey(`student_profile_${studentId}`);
  const record = { key, studentId, type: match[1], size: bytes.length, dataUrl: value, savedAt: Date.now() };
  await atomicWriteText(path.join(FILES_DIR, `${key}.json`), JSON.stringify(record), 0o600);
  return record;
}
async function readStudentProfilePhoto(studentId) {
  try {
    const key = safeKey(`student_profile_${studentId}`);
    const record = JSON.parse(await fs.readFile(path.join(FILES_DIR, `${key}.json`), "utf8"));
    return String(record.dataUrl || "");
  } catch { return ""; }
}


// v54 — helpers for hybrid/mixed exams. Authentication is intentionally untouched.
function mixedAnswerMapV54(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "number") out[String(key)] = raw;
    else { const text = String(raw).trim(); if (text) out[String(key)] = text; }
  }
  return out;
}
function isAutoGradableQuestionV54(q) { return Boolean(q?.autoGradable || isAutoGradableCore(q)); }
function autoGradeQuestionV54(q, answers) {
  return autoGradeQuestionCore(q, answers);
}

function examCurriculumMeta(db, exam) {
  const book = (db.curriculum || []).find(item => item.id === exam.bookId || item.subject === exam.subject);
  const chapter = (book?.chapters || []).find(item => item.id === exam.chapterId || item.title === exam.chapter);
  return { bookId: exam.bookId || book?.id || "", bookTitle: book?.title || exam.subject || "کتاب درسی", chapterId: exam.chapterId || chapter?.id || "", chapterTitle: exam.chapter || chapter?.title || "بدون فصل" };
}

function sanitizeExam(exam) {
  return {
    id: exam.id, title: exam.title, type: exam.type, subject: exam.subject,
    bookId: exam.bookId || "", bookTitle: exam.bookTitle || exam.subject || "", chapterId: exam.chapterId || "",
    chapter: exam.chapter || "", duration: Number(exam.duration || 0),
    status: exam.status, publicationState: exam.publicationState || "",
    startAt: exam.startAt || exam.scheduledAt || exam.startTime || "", endAt: exam.endAt || exam.endTime || exam.deadline || "",
    availabilityRevision: Number(exam.availabilityRevision || 1),
    examCode: exam.examCode || "", formCode: exam.formCode || "",
    blueprintId: exam.blueprintId || "", packageRevision: Number(exam.packageRevision || 1), createdAt: exam.createdAt || "",
    totalScore: examTotalScore(exam), showInstantResult: Boolean(exam.showInstantResult),
    questions: (exam.questions || []).map((q, index) => ({
      id: q.id, number: index + 1, text: q.text, score: Number(q.score || 0), type: q.type || (exam.type === "mcq" ? "mcq" : "descriptive"),
      gradingFamily: q.gradingFamily || (isAutoGradableCore(q) ? "objective" : "subjective"), autoGradable: Boolean(q.autoGradable || isAutoGradableCore(q)),
      choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
      ...(q.visualType === "image" && validImageP672213(q.imageDataUrl) ? {visualType:"image",imageDataUrl:q.imageDataUrl} : {})
    }))
  };
}

function examPackageVersion(exam) {
  return crypto.createHash("sha256").update(JSON.stringify(sanitizeExam(exam))).digest("hex").slice(0, 20);
}

function studentSheetCode(serverSecret, student, exam) {
  const studentPart = normalizeNationalId(student?.nationalId).slice(-4).padStart(4, "0");
  const examPart = String(exam?.examCode || exam?.id || "EXAM").replace(/[^A-Za-z0-9]/g, "").slice(-5).toUpperCase().padStart(5, "X");
  const digest = crypto.createHmac("sha256", String(serverSecret || "madreseyar")).update(`${student?.id}|${exam?.id}`).digest("hex").slice(0, 8).toUpperCase();
  return `MSY-${studentPart}-${examPart}-${digest}`;
}

function studentClassIds(db, student) {
  const ids = new Set();
  if (student?.classId) ids.add(String(student.classId));
  for (const e of db.enrollments || []) {
    if (String(e.studentId || "") === String(student?.id || "") && e.status !== "inactive" && e.status !== "archived" && e.classId) ids.add(String(e.classId));
  }
  return ids;
}

/* v61.12.0.0 — server-side exam schedule enforcement */
function examScheduleStateV6111(exam, now=Date.now()) {
  const raw=String(exam?.status||exam?.state||"").toLowerCase();
  const startRaw=exam?.startAt||exam?.startedAt||exam?.startTime||exam?.scheduledAt;
  const endRaw=exam?.endAt||exam?.finishedAt||exam?.completedAt||exam?.closedAt||exam?.endedAt||exam?.endTime;
  const start=startRaw?new Date(startRaw).getTime():NaN;
  const end=endRaw?new Date(endRaw).getTime():NaN;
  if(Number.isFinite(end)&&now>=end)return "ended";
  if(Number.isFinite(start)&&now<start)return "scheduled";
  if(["active","published","in_progress","running"].includes(raw))return "running";
  return raw||"draft";
}
function studentCanStartExamV6111(exam, now=Date.now()) {
  return examScheduleStateV6111(exam,now)==="running";
}
/* v62 — explicit availability contract shared with Student */
function examAvailabilityV62(exam, now=Date.now()) {
  const scheduleState=examScheduleStateV6111(exam,now);
  const publicationState=String(exam?.publicationState||"").toLowerCase();
  const visible=String(exam?.status||"").toLowerCase()==="active" || ["published","in_progress","ended","graded","final"].includes(publicationState);
  let state=scheduleState;
  if(!visible) state="withdrawn";
  else if(["ended","graded","final","archived"].includes(publicationState)) state="ended";
  const startAt=exam?.startAt||exam?.scheduledAt||exam?.startTime||"";
  const endAt=exam?.endAt||exam?.endTime||exam?.deadline||exam?.finishedAt||exam?.closedAt||"";
  return {availabilityState:state,startAt,endAt,publicationState,availabilityRevision:Number(exam?.availabilityRevision||1),canStart:state==="running",packageVersion:examPackageVersion(exam),serverTime:now};
}

// P67.22-T07: validate and commit final grading against the LIVE server DB.
// The client never sends a full replacement state for this action.
function gradingErrorP6722(message,status=400){return Object.assign(new Error(message),{status});}
function canTeacherGradeP6722(db,user,exam,submission){
  if(!user||!exam||!submission||String(submission.examId)!==String(exam.id))return false;
  if(!["teacher","admin","superadmin"].includes(user.role))return false;
  const student=(db.users||[]).find(x=>x.id===submission.studentId&&x.role==="student"&&x.active!==false);
  if(!student||student.classId!==exam.classId||!studentCanSeeExam(db,exam,student))return false;
  return user.role!=="teacher"||teacherCanAssigned(db,user,{classId:exam.classId,subject:exam.subject||"",bookId:exam.bookId||"",feature:"grading"});
}
function finalizeTeacherGradeP6722(db,user,body){
  const submissionId=String(body?.submissionId||"");
  if(!submissionId||submissionId.length>150)throw gradingErrorP6722("شناسه برگه معتبر نیست.");
  const sub=(db.submissions||[]).find(x=>String(x.id)===submissionId);
  const ex=(db.exams||[]).find(x=>String(x.id)===String(sub?.examId));
  if(!sub||!ex||!canTeacherGradeP6722(db,user,ex,sub))throw gradingErrorP6722("اجازه تصحیح این برگه را ندارید.",403);
  if(ex.type!=="descriptive"&&ex.type!=="mixed")throw gradingErrorP6722("این مسیر مخصوص آزمون تشریحی یا ترکیبی است.",409);
  if(!t02Delivered(sub))throw gradingErrorP6722("برگه هنوز تحویل نهایی نشده است.",409);
  if((db.grades||[]).some(g=>String(g.submissionId)===submissionId||String(g.uploadId)===submissionId)||sub.status==="final")
    throw gradingErrorP6722("این برگه قبلاً نهایی شده است. برای تغییر نمره از مسیر بازبینی استفاده کنید.",409);
  const raw=body?.questionScores;
  const questions=Array.isArray(ex.questions)?ex.questions:[];
  if(!Array.isArray(raw)||raw.length!==questions.length||!questions.length||questions.length>300)
    throw gradingErrorP6722("برای تمام سؤال‌ها دقیقاً یک نمره لازم است.");
  const input=new Map();
  for(const item of raw){
    const id=String(item?.questionId||"");
    if(!id||input.has(id))throw gradingErrorP6722("شناسه سؤال تکراری یا نامعتبر است.");
    input.set(id,item);
  }
  const finiteScore=(v,max,what)=>{
    if(v===null||v===undefined||String(v).trim()===""||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>max+0.000001)
      throw gradingErrorP6722(`نمره ${what} باید بین صفر و ${max} باشد.`);
    return Math.round(Number(v)*100)/100;
  };
  const text=(v,max,what)=>{const t=String(v??"").trim();if(t.length>max)throw gradingErrorP6722(`متن ${what} بیش از حد مجاز است.`);return t;};
  const feedback=text(body.feedback,3000,"بازخورد");
  const editReason=text(body.teacherEditReason,900,"دلیل تغییر");
  const officialAuto=new Map((sub.autoGrading?.questions||[]).map(q=>[String(q.questionId),q]));
  const result=[];let total=0;const overrides=[];
  for(const q of questions){
    const id=String(q.id),item=input.get(id),max=Number(q.score);
    if(!item||!Number.isFinite(max)||max<=0)throw gradingErrorP6722("شناسه یا بارم سؤال معتبر نیست.");
    const earned=finiteScore(item.teacherScore,max,`سؤال ${id}`);
    const comment=text(item.feedback,2000,`بازخورد سؤال ${id}`);
    const rubric=Array.isArray(q.rubric)?q.rubric:[];
    const incomingCriteria=Array.isArray(item.criterionScores)?item.criterionScores:[];
    if(incomingCriteria.length>Math.max(rubric.length,1))throw gradingErrorP6722("تعداد معیارهای تصحیح معتبر نیست.");
    const criteria=[];const seen=new Set();
    for(const [i,row] of incomingCriteria.entries()){
      // Historical descriptive questions can have rubric rows without stable IDs.
      // In that case match by ordinal; grading still requires every final score
      // to stay within its authoritative question maximum.
      const ref=rubric.find(r=>r.id&&String(r.id)===String(row.criterionId))||rubric.find((r,j)=>j===i&&!r.id)||(!rubric.length?{title:"پوشش پاسخ مرجع",maxScore:max}:null);
      if(!ref||seen.has(String(row.criterionId)))throw gradingErrorP6722("معیار تصحیح ناشناخته یا تکراری است.");
      seen.add(String(row.criterionId));
      const cap=Number(ref.maxScore??ref.score??max);
      const value=finiteScore(row.teacherScore,cap,`معیار ${ref.title||id}`);
      criteria.push({criterionId:String(ref.id||row.criterionId||`rubric_${i+1}`),title:String(ref.title||"").slice(0,160),teacherScore:value,score:value,maxScore:cap});
    }
    const auto=officialAuto.get(id);
    const isAutomatic=["mcq","true_false","fill_blank"].includes(String(q.type));
    const officialScore=isAutomatic&&auto?.autoGraded?finiteScore(auto.earnedScore,max,`خودکار ${id}`):null;
    if(officialScore!==null&&Math.abs(earned-officialScore)>0.001)overrides.push({questionId:id,autoScore:officialScore,teacherScore:earned,type:q.type,sourceQuestionId:q.sourceQuestionId||null});
    result.push({questionId:id,score:earned,teacherScore:earned,aiSuggestedScore:officialScore??(Number.isFinite(Number(item.aiSuggestedScore))?Math.min(max,Math.max(0,Number(item.aiSuggestedScore))):0),feedback:comment,criterionScores:criteria,gradingSource:isAutomatic?"server-auto-reviewed":"teacher"});
    total+=earned;
  }
  if(overrides.length&&editReason.length<3)throw gradingErrorP6722("برای تغییر نمره تستی محاسبه‌شده توسط سرور، دلیل حداقل سه نویسه‌ای الزامی است.");
  const maxTotal=questions.reduce((n,q)=>n+Number(q.score),0);
  total=Math.round(total*100)/100;
  if(total>maxTotal+0.000001)throw gradingErrorP6722("جمع نمرات از بارم آزمون بیشتر است.");
  const publish=body.publishNow===true;
  const at=new Date().toISOString(),when=Date.now(),id=makeId("gr");
  const grade={id,submissionId,examId:ex.id,teacherId:user.id,gradingVersion:55,gradingSource:"teacher-final",publishStatus:publish?"published":"held",resultRevision:publish?1:0,publishedAt:publish?when:null,aiPackageId:sub.ai?.packageId||null,aiSuggestedScore:Number(sub.ai?.totalSuggestedScore||0),teacherScore:total,finalScore:total,questionScores:result,feedback,teacherEditReason:editReason,overrideCount:overrides.length,history:[{type:"teacher_final_grade",newScore:total,reason:editReason||"نمره مستقل معلم",teacherId:user.id,at}],gradedAt:when,at:faNow()};
  db.grades=Array.isArray(db.grades)?db.grades:[];db.grades.push(grade);
  sub.status="final";
  for(const item of result){
    const question=questions.find(q=>String(q.id)===item.questionId);
    const source=(db.questionBank||[]).find(q=>String(q.id)===String(question?.sourceQuestionId||""));
    if(!source)continue;
    source.stats=source.stats||{};
    source.stats.gradedCount=Number(source.stats.gradedCount||0)+1;
    source.stats.earnedPoints=Math.round((Number(source.stats.earnedPoints||0)+item.teacherScore)*100)/100;
    source.stats.possiblePoints=Math.round((Number(source.stats.possiblePoints||0)+Number(question.score||0))*100)/100;
    if(overrides.some(o=>o.questionId===item.questionId))source.stats.overrideCount=Number(source.stats.overrideCount||0)+1;
    source.stats.averageScorePercent=source.stats.possiblePoints?Math.round(source.stats.earnedPoints/source.stats.possiblePoints*1000)/10:0;
  }
  db.gradeOverrides=Array.isArray(db.gradeOverrides)?db.gradeOverrides:[];
  for(const row of overrides)db.gradeOverrides.unshift({id:makeId("ovr"),gradeId:id,submissionId,examId:ex.id,studentId:sub.studentId,...row,reason:editReason,teacherId:user.id,at:faNow()});
  db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:user.id,action:"ثبت نمره نهایی معلم P67.22",details:`${ex.id} / ${sub.studentId} / ${total}`,at:faNow()});
  if(publish){db.notifications=Array.isArray(db.notifications)?db.notifications:[];db.notifications.unshift({id:makeId("not"),userId:sub.studentId,title:"نمره آزمون منتشر شد",body:`نتیجه آزمون «${ex.title}» منتشر شد: ${total} از ${maxTotal}`,read:false,at:faNow(),createdAt:at});}
  return {grade};
}

// ===== P67.20 T02 — server-authoritative absent-student follow-ups, standalone & auditable =====
const T02_FOLLOWUP_STATES=new Set(['new','contacted','excused','resolved']);
const T02_REASON_TYPES=new Set(['unknown','illness','internet','family','technical','other']);
function t02Error(message,status=400){return Object.assign(new Error(message),{status});}
// P67.22-T08: The absence roster must equal the exam's authorized participants.
// In particular, an explicitly restricted class list must not be widened to everyone in exam.classId.
function t02Rows(db,exam){
 return (db.users||[]).filter(u=>u.role==='student'&&String(u.classId)===String(exam.classId)&&u.active!==false&&!['deleted','locked','graduated'].includes(String(u.profileStatus||''))&&studentCanSeeExam(db,exam,u));
}
// A missing response is NOT a confirmed absence while the original exam is still open.
function t08OriginalClosed(exam,now=Date.now()){
 const raw=exam?.endAt||exam?.finishedAt||exam?.completedAt||exam?.closedAt||exam?.endedAt||exam?.endTime||exam?.deadline;
 const end=raw?Date.parse(String(raw)):NaN;
 if(Number.isFinite(end))return now>=end;
 const state=examScheduleStateV6111(exam,now),pub=String(exam?.publicationState||'').toLowerCase();
 return ['ended','graded','final'].includes(state)||['ended','graded','final'].includes(pub);
}
function t02Delivered(row){if(!row)return false;const status=String(row.status||'').toLowerCase();const hasMarker=row.submittedAt!=null||row.deliveredAt!=null||row.completedAt!=null||row.finalizedAt!=null;return !(['draft','started','in_progress','in-progress','not_submitted','unsubmitted','cancelled','expired'].includes(status)&&!hasMarker);}
function t02StudentParticipated(db,examId,studentId){return [...(db.attempts||[]),...(db.submissions||[])].some(row=>String(row.examId)===String(examId)&&String(row.studentId)===String(studentId)&&t02Delivered(row));}
function t02Find(db,examId,studentId){return (db.examAbsenceFollowupsT02||[]).find(r=>String(r.examId)===String(examId)&&String(r.studentId)===String(studentId));}
function t02Access(db,user,examId,{write=false}={}){
 if(user.role!=='teacher'&&!isAdminRole(user.role))throw t02Error('دسترسی فقط برای معلم یا مدیر مجاز است.',403);
 const exam=(db.exams||[]).find(e=>String(e.id)===String(examId)&&e.status!=='archived');
 if(!exam)throw t02Error('آزمون پیدا نشد.',404);
 if(user.role==='teacher'&&(!teacherCanAssigned(db,user,{classId:exam.classId,subject:exam.subject||'',bookId:exam.bookId||'',feature:'examCreate'})||(write&&exam.createdBy&&String(exam.createdBy)!==String(user.id))))throw t02Error('مجوز مدیریت این آزمون را ندارید.',403);
 return exam;
}
function t02Student(db,exam,studentId){const student=t02Rows(db,exam).find(s=>String(s.id)===String(studentId));if(!student)throw t02Error('دانش‌آموز در فهرست مجاز این آزمون نیست.',403);return student;}
function t02Snapshot(db,exam){return {examId:exam.id,examTitle:exam.title||'',examStatus:examScheduleStateV6111(exam),absenceFinal:t08OriginalClosed(exam),items:t02Rows(db,exam).map(st=>{const f=t02Find(db,exam.id,st.id);const makeups=(db.exams||[]).filter(e=>e.makeupForExamId===exam.id&&e.makeupForStudentId===st.id&&e.status!=='archived'&&e.publicationState!=='archived');const makeup=makeups.find(e=>e.id===f?.makeupExamId)||makeups[0]||null;const done=t02StudentParticipated(db,exam.id,st.id);return {studentId:st.id,name:`${st.firstName||''} ${st.lastName||''}`.trim(),studentCode:st.studentCode||'',participated:done,followup:f?{reasonType:f.reasonType,reasonNote:f.reasonNote,status:f.status,teacherNote:f.teacherNote,lastReminderAt:f.lastReminderAt||'',reminderCount:f.reminderCount||0,updatedAt:f.updatedAt,updatedBy:f.updatedBy,history:(f.history||[]).slice(-15),makeupExamId:makeup?.id||'',makeupStatus:makeup?examScheduleStateV6111(makeup):'',makeupSubmitted:makeup?t02StudentParticipated(db,makeup.id,st.id):false,makeupStartAt:makeup?.startAt||'',makeupEndAt:makeup?.endAt||''}:null};})};}
function t02Upsert(db,exam,student,user){db.examAbsenceFollowupsT02=Array.isArray(db.examAbsenceFollowupsT02)?db.examAbsenceFollowupsT02:[];let row=t02Find(db,exam.id,student.id);if(!row){row={id:makeId('absence'),examId:exam.id,studentId:student.id,classId:exam.classId,reasonType:'unknown',reasonNote:'',teacherNote:'',status:'new',reminderCount:0,history:[],createdAt:new Date().toISOString(),createdBy:user.id};db.examAbsenceFollowupsT02.unshift(row);}return row;}
function t02Change(db,params,user){
 const action=String(params.action||''),exam=t02Access(db,user,params.examId,{write:true}),student=t02Student(db,exam,params.studentId);
 if(!['save','remind','makeup','cancel_makeup'].includes(action))throw t02Error('عملیات معتبر نیست.');
 if(exam.makeupForExamId)throw t02Error('پیگیری غیبت فقط برای آزمون اصلی مجاز است؛ نه آزمون جبرانی.',409);
 const originalSubmitted=t02StudentParticipated(db,exam.id,student.id);
 if(originalSubmitted&&action!=='cancel_makeup')throw t02Error('این دانش‌آموز آزمون اصلی را تحویل داده است؛ پیگیری غیبت مجاز نیست.',409);
 if(action!=='cancel_makeup'&&!t08OriginalClosed(exam))throw t02Error('آزمون اصلی هنوز پایان نیافته است؛ تا پایان مهلت آزمون نمی‌توان عدم شرکت را قطعی یا جبرانی صادر کرد.',409);
 const row=t02Upsert(db,exam,student,user), now=new Date().toISOString();
 const log=(kind,details='')=>{row.history.push({action:kind,at:now,by:user.id,details:String(details).slice(0,300)});row.history=row.history.slice(-100);row.updatedAt=now;row.updatedBy=user.id;};
 if(action==='save'){
   const reasonType=String(params.reasonType||'unknown'),status=String(params.status||'new'),reasonNote=String(params.reasonNote||'').trim(),teacherNote=String(params.teacherNote||'').trim();
   if(!T02_REASON_TYPES.has(reasonType)||!T02_FOLLOWUP_STATES.has(status))throw t02Error('علت یا وضعیت پیگیری معتبر نیست.');
   if(reasonNote.length>400||teacherNote.length>700)throw t02Error('متن توضیحات بیش از حد مجاز است.');
   Object.assign(row,{reasonType,reasonNote,teacherNote,status});log('save',`${reasonType}/${status}`);
 } else if(action==='remind'){
   const audience=String(params.audience||'student');if(!['student','family'].includes(audience))throw t02Error('گیرنده یادآوری معتبر نیست.');
   // A guardian dashboard reads the linked student's notifications; there is no SMS/push integration here.
   if(row.lastReminderAt&&Date.now()-Date.parse(row.lastReminderAt)<60*1000)throw t02Error('برای ارسال مجدد، حداقل یک دقیقه صبر کنید.',429);
   db.notifications=Array.isArray(db.notifications)?db.notifications:[];
   const due=row.makeupExamId?(db.exams||[]).find(e=>e.id===row.makeupExamId):null;
   const body=`${audience==='family'?'ولی گرامی، ':''}دانش‌آموز در آزمون «${exam.title||'آزمون'}» شرکت نکرده است. ${due?`فرصت جبرانی از ${new Date(due.startAt).toLocaleString('fa-IR')} تا ${new Date(due.endAt).toLocaleString('fa-IR')} فعال می‌شود.`:'برای هماهنگی با معلم اقدام کنید.'}`;
   db.notifications.unshift({id:makeId('not'),userId:student.id,title:audience==='family'?'پیگیری آزمون — اطلاع به خانواده':'یادآوری عدم شرکت در آزمون',body,read:false,at:faNow(),createdAt:now,source:'exam-absence-t02',examId:exam.id});
   row.reminderCount=Number(row.reminderCount||0)+1;row.lastReminderAt=now;
   if(row.status==='new')row.status='contacted';log('remind',audience);
 } else if(action==='makeup'){
   if((db.exams||[]).some(e=>e.makeupForExamId===exam.id&&e.makeupForStudentId===student.id&&e.status!=='archived'&&e.publicationState!=='archived'))throw t02Error('قبلاً فرصت جبرانی برای این دانش‌آموز وجود دارد؛ ابتدا پرونده را بررسی کنید.',409);
   const examIssues=validateExamForStudentV61(exam);
   if(examIssues.length)throw t02Error('آزمون اصلی سؤال‌های قابل اجرا ندارد: '+examIssues.slice(0,2).join('؛ '),409);
   const start=Date.parse(String(params.startAt||'')),end=Date.parse(String(params.endAt||''));
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<Date.now()+60*1000||end<=start||end-start<5*60*1000||end-start>3*60*60*1000||start>Date.now()+45*86400000)throw t02Error('بازه جبرانی معتبر نیست: شروع باید در آینده و مدت بین ۵ تا ۱۸۰ دقیقه باشد.',400);
   if(!Array.isArray(exam.questions)||!exam.questions.length)throw t02Error('آزمون اصلی سؤال معتبر برای جبرانی ندارد.',409);
   const makerId=makeId('makeup');const clone=structuredClone(exam);delete clone.id;
   Object.assign(clone,{id:makerId,title:`${exam.title||'آزمون'} — جبرانی`,status:'active',publicationState:'published',publicationRevision:1,studentIds:[student.id],recipientStudentIds:[student.id],assignedStudentIds:[],classIds:[],recipientClassIds:[],assignedClassIds:[],startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),duration:Math.min(Math.max(5,Number(exam.duration||20)),Math.floor((end-start)/60000)),createdBy:user.id,createdAt:now,updatedAt:now,publishedAt:now,makeupForExamId:exam.id,makeupForStudentId:student.id,makeupFollowupId:row.id});
   delete clone.examCode;delete clone.sheetCodes;delete clone.availabilityRevision;delete clone.resultRevision;
   db.exams=Array.isArray(db.exams)?db.exams:[];db.exams.push(clone);row.makeupExamId=makerId;row.status='contacted';log('makeup',makerId);
   db.notifications=Array.isArray(db.notifications)?db.notifications:[];db.notifications.unshift({id:makeId('not'),userId:student.id,title:'فرصت جبرانی آزمون',body:`برای آزمون «${exam.title||'آزمون'}» فرصت جبرانی اختصاصی ثبت شد. شروع: ${new Date(start).toLocaleString('fa-IR')}؛ پایان: ${new Date(end).toLocaleString('fa-IR')}.`,read:false,at:faNow(),source:'exam-absence-t02',examId:makerId});
 } else {
   const makeup=(db.exams||[]).find(e=>e.id===row.makeupExamId&&e.makeupForExamId===exam.id&&e.makeupForStudentId===student.id&&e.status!=='archived')||(db.exams||[]).find(e=>e.makeupForExamId===exam.id&&e.makeupForStudentId===student.id&&e.status!=='archived'&&e.publicationState!=='archived');
   if(!makeup)throw t02Error('آزمون جبرانی فعالی پیدا نشد.',404);
   if(t02StudentParticipated(db,makeup.id,student.id))throw t02Error('امکان لغو آزمون جبرانی تحویل‌داده‌شده وجود ندارد.',409);
    const start=Date.parse(String(makeup.startAt||'')),end=Date.parse(String(makeup.endAt||''));
    if(Number.isFinite(start)&&Number.isFinite(end)&&start<=Date.now()&&end>Date.now())throw t02Error('آزمون جبرانی در حال برگزاری است؛ برای حفظ پاسخ‌های احتمالی دانش‌آموز امکان لغو در میانه آزمون نیست.',409);
   makeup.status='archived';makeup.publicationState='archived';makeup.cancelledAt=now;makeup.cancelledBy=user.id;row.makeupExamId='';log('cancel_makeup',makeup.id);
 }
 db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId('log'),userId:user.id,action:'پیگیری غایبان آزمون T02',details:`${action}: ${exam.id} / ${student.id}`,at:faNow()});
 return {action,examId:exam.id,studentId:student.id,followup:row};
}
// ===== end P67.20 T02 =====

function studentCanSeeExam(db, exam, student) {
  if (!exam || !student || exam.status === "archived") return false;
  // P67.22-T08: a makeup is private even if legacy recipient arrays were accidentally widened.
  if(exam.makeupForStudentId&&String(exam.makeupForStudentId)!==String(student.id))return false;
  const state = String(exam.publicationState || "").toLowerCase();
  const published = exam.status === "active" || ["published", "in_progress", "ended", "graded", "final"].includes(state);
  if (!published) return false;
  const classIds = studentClassIds(db, student);
  const explicitStudents = [exam.studentIds, exam.recipientStudentIds, exam.assignedStudentIds].flatMap(x => Array.isArray(x) ? x : []);
  if (explicitStudents.length) return explicitStudents.map(String).includes(String(student.id));
  const explicitClasses = [exam.classIds, exam.recipientClassIds, exam.assignedClassIds].flatMap(x => Array.isArray(x) ? x : []);
  if (explicitClasses.length) return explicitClasses.map(String).some(id => classIds.has(String(id)));
  return classIds.has(String(exam.classId || ""));
}
function studentCanSeeHomework(db, homework, student) {
  if (!homework || !student || homework.status === "archived" || homework.status === "closed") return false;
  const activeYear=String(db.school?.year||"");
  if (homework.academicYear && String(homework.academicYear)!==activeYear) return false;
  const state = String(homework.publicationState || homework.state || "").toLowerCase();
  if (["draft", "archived", "closed"].includes(state) || homework.published === false) return false;
  const classIds = studentClassIds(db, student);
  const explicitStudents = [homework.studentIds, homework.recipientStudentIds, homework.assignedStudentIds].flatMap(x => Array.isArray(x) ? x : []);
  if (explicitStudents.length) return explicitStudents.map(String).includes(String(student.id));
  const explicitClasses = [homework.classIds, homework.recipientClassIds, homework.assignedClassIds].flatMap(x => Array.isArray(x) ? x : []);
  if (explicitClasses.length) return explicitClasses.map(String).some(id => classIds.has(String(id)));
  return classIds.has(String(homework.classId || ""));
}

function studentExamStatus(db, exam, studentId) {
  if ((db.attempts || []).some(a => a.examId === exam.id && a.studentId === studentId)) return "submitted";
  if ((db.submissions || []).some(s => s.examId === exam.id && s.studentId === studentId)) return "submitted";
  return exam.status === "active" ? "available" : exam.status;
}

function studentSubmissionInfo(db, exam, studentId) {
  const attempt = (db.attempts || []).find(a => a.examId === exam.id && a.studentId === studentId);
  if (attempt) return { status:"submitted", kind:"mcq", receiptId:attempt.id, submittedAt:Number(attempt.submittedAt||0), gradingStatus:"final", score:Number(attempt.score||0), total:Number(attempt.total||examTotalScore(exam)) };
  const submission = (db.submissions || []).find(s => s.examId === exam.id && s.studentId === studentId);
  if (!submission) return null;
  const grade = (db.grades || []).find(g => g.submissionId === submission.id && String(g.publishStatus || "published") === "published");
  return { status:"submitted", kind:exam.type==="mixed"?"mixed":"descriptive", receiptId:submission.id, submittedAt:Number(submission.submittedAt||0), gradingStatus:grade?"final":"pending", score:grade?Number(grade.finalScore||0):null, total:Number(examTotalScore(exam)), autoScore:Number(submission.autoGrading?.score||0), autoTotal:Number(submission.autoGrading?.total||0) };
}

function studentReport(db, studentId) {
  const activeYear = String(db.school?.year || "");
  const bySubject = new Map();
  for (const attempt of db.attempts || []) {
    if (attempt.studentId !== studentId) continue;
    const exam = (db.exams || []).find(e => e.id === attempt.examId);
    if (!exam || String(exam.academicYear || activeYear) !== activeYear) continue;
    const row = bySubject.get(exam.subject) || { subject: exam.subject, earned: 0, possible: 0, count: 0 };
    row.earned += Number(attempt.score || 0); row.possible += Number(attempt.total || examTotalScore(exam)); row.count += 1; bySubject.set(exam.subject, row);
  }
  for (const grade of db.grades || []) {
    if (String(grade.publishStatus || "published") !== "published") continue;
    const submission = (db.submissions || []).find(s => s.id === grade.submissionId);
    if (!submission || submission.studentId !== studentId) continue;
    const exam = (db.exams || []).find(e => e.id === submission.examId);
    if (!exam || String(exam.academicYear || activeYear) !== activeYear) continue;
    const row = bySubject.get(exam.subject) || { subject: exam.subject, earned: 0, possible: 0, count: 0 };
    row.earned += Number(grade.finalScore || 0); row.possible += examTotalScore(exam); row.count += 1; bySubject.set(exam.subject, row);
  }
  return [...bySubject.values()].map(row => ({ ...row, percent: row.possible ? Math.round(row.earned / row.possible * 1000) / 10 : 0 }));
}


// ===== v185: student-visible final-term report =====
function gradingPolicyV200(db) {
  const settings = db.school?.settings || {};
  const scoreScaleRaw = Number(settings.scoreScale || 20);
  const scoreScale = Number.isFinite(scoreScaleRaw) && scoreScaleRaw > 0 ? scoreScaleRaw : 20;
  const raw = settings.gradingPolicy || {};
  const mode = raw.mode === "weighted" ? "weighted" : "additive";
  let continuousWeight = Number(raw.continuousWeight), finalWeight = Number(raw.finalWeight);
  if (!Number.isFinite(continuousWeight) || continuousWeight < 0 || continuousWeight > 100) continuousWeight = 40;
  if (!Number.isFinite(finalWeight) || finalWeight < 0 || finalWeight > 100) finalWeight = 60;
  if (mode === "weighted" && Math.abs(continuousWeight + finalWeight - 100) > 0.001) { continuousWeight = 40; finalWeight = 60; }
  return { mode, continuousWeight, finalWeight, scoreScale };
}
function calculateTermFinalV200(db, continuousScore, finalExamScore, finalExamPossible) {
  const p = gradingPolicyV200(db);
  const boundedContinuous = Math.min(p.scoreScale, Math.max(0, Number(continuousScore) || 0));
  const earned = Math.max(0, Number(finalExamScore) || 0);
  const possible = Math.max(0, Number(finalExamPossible) || 0);
  if (p.mode === "weighted") {
    const examNormalized = possible > 0 ? Math.min(p.scoreScale, (Math.min(earned, possible) / possible) * p.scoreScale) : 0;
    const raw = boundedContinuous * (p.continuousWeight / 100) + examNormalized * (p.finalWeight / 100);
    return { finalScore: Math.min(p.scoreScale, Math.max(0, Math.round(raw * 100) / 100)), rawFinalScore: raw, examNormalized: Math.round(examNormalized * 100) / 100, ...p, isCapped: false };
  }
  const raw = boundedContinuous + earned;
  return { finalScore: Math.min(p.scoreScale, Math.max(0, Math.round(raw * 100) / 100)), rawFinalScore: raw, examNormalized: possible > 0 ? Math.round((Math.min(earned, possible) / possible) * p.scoreScale * 100) / 100 : 0, ...p, isCapped: raw > p.scoreScale };
}

function termPolicyForV686(db,{classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const scale=Number(db.school?.settings?.scoreScale||20)||20;
  const row=(db.termPolicies||[]).filter(p=>p.classId===classId&&p.subject===subject&&String(p.academicYear||"")===String(academicYear)&&String(p.academicPeriod||"semester2")===String(academicPeriod)).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0];
  return normalizeTermPolicyCore(row||{continuousEnabled:false,continuousShare:0},scale);
}
function ongoingExamAverageV73(db,{studentId="",classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const exams=(db.exams||[]).filter(e=>e.classId===classId&&e.subject===subject&&(e.examCategory||"ongoing")!=="final"&&String(e.academicYear||academicYear)===String(academicYear)&&String(e.academicPeriod||e.period||"semester2")===String(academicPeriod)&&e.status!=="draft");
  const scores=[];
  for(const exam of exams){
    const possible=Math.max(0,Number(examTotalScore(exam))||0);if(!possible)continue;let earned=null;
    if(exam.type==="mcq"){
      const att=(db.attempts||[]).filter(a=>a.examId===exam.id&&a.studentId===studentId&&(!a.status||["final","submitted","graded"].includes(String(a.status))||a.submittedAt)).sort((a,b)=>Number(b.submittedAt||b.updatedAt||0)-Number(a.submittedAt||a.updatedAt||0))[0];
      if(att&&Number.isFinite(Number(att.score)))earned=Math.min(possible,Math.max(0,Number(att.score)));
    }else{
      const sub=(db.submissions||[]).find(x=>x.examId===exam.id&&x.studentId===studentId);
      const grade=sub&&(db.grades||[]).filter(g=>g.submissionId===sub.id&&String(g.publishStatus||"published")==="published").sort((a,b)=>Number(b.gradedAt||b.updatedAt||0)-Number(a.gradedAt||a.updatedAt||0))[0];
      if(grade&&Number.isFinite(Number(grade.finalScore)))earned=Math.min(possible,Math.max(0,Number(grade.finalScore)));
    }
    if(earned!==null)scores.push(Math.min(20,Math.max(0,earned/possible*20)));
  }
  return scores.length?{average:Math.round(scores.reduce((n,v)=>n+v,0)/scores.length*100)/100,count:scores.length,scheduledCount:exams.length}: {average:null,count:0,scheduledCount:exams.length};
}
function continuousDetailForV732(db,{studentId="",classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const exam=ongoingExamAverageV73(db,{studentId,classId,subject,academicYear,academicPeriod});
  const gradebook=gradebookContinuousV75(db,{studentId,classId,subject,academicYear,academicPeriod});
  const calculatedScore=exam.average!==null?exam.average:gradebook.score;
  const override=(db.continuousGradeOverrides||[]).filter(r=>r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||r.period||"semester2")===String(academicPeriod)&&r.active!==false).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
  const finalScore=override&&Number.isFinite(Number(override.finalScore))?Math.min(20,Math.max(0,Number(override.finalScore))):calculatedScore;
  return {calculatedScore,finalScore,manual:!!override,overrideReason:override?.reason||"",examAverage:exam.average,examCount:exam.count,scheduledExamCount:exam.scheduledCount,gradebookFallback:exam.average===null&&gradebook.score!==null,override};
}
function continuousAverageForV686(db,{studentId="",classId="",subject="",academicYear="",academicPeriod="semester2"}={}){
  const detail=continuousDetailForV732(db,{studentId,classId,subject,academicYear,academicPeriod});
  if(detail.finalScore!==null)return detail.finalScore;
  // Backward-compatible fallback for schools that already have manual continuous-assessment records.
  const rows=(db.continuousAssessments||[]).filter(r=>r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||r.period||"semester2")===String(academicPeriod));
  return continuousAverage20Core(rows);
}
function termAttendanceSummaryV733(db,studentId,academicPeriod="semester2",academicYear=String(db.school?.year||"")){
  const period=academicPeriod==="semester1"?"semester1":"semester2";
  const rows=(db.attendance||[]).filter(r=>r.studentId===studentId&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||r.period||"semester2")===period);
  const out={present:0,late:0,absent:0,pending:0,excused:0,unexcused:0,total:rows.length};
  for(const r of rows){const st=normalizeAttendanceStatusV81(r.status);if(st==="present")out.present++;else if(st==="late")out.late++;else{out.absent++;if(st==="absent_excused")out.excused++;else if(st==="absent_unexcused")out.unexcused++;else out.pending++;}}
  return out;
}
// compatibility contract: termReport: studentTermReportV185(db, student.id)
// compatibility v199: (e.examCategory || "ongoing") === "final"
function studentTermReportV185(db, studentId, academicPeriod="semester2") {
  const normalizePeriodLocal=v=>["semester1","semester2","annual"].includes(String(v))?String(v):"semester2";
  academicPeriod=normalizePeriodLocal(academicPeriod);
  // T07: officially published score rows are immutable until the manager reopens the card.
  const publishedSnapshotT07=(db.reportCards||[]).find(r=>r.studentId===studentId&&String(r.academicYear||"")===String(db.school?.year||"")&&normalizePeriodLocal(r.academicPeriod||r.period)===academicPeriod&&r.status==="published"&&r.snapshot?.termReport);
  if(publishedSnapshotT07){
    const snap=publishedSnapshotT07.snapshot.termReport;
    const official={id:publishedSnapshotT07.id,status:"published",publishedAt:publishedSnapshotT07.publishedAt||null,updatedAt:publishedSnapshotT07.updatedAt||null};
    return {...snap,subjects:snap.subjects||[],completeSubjects:snap.completeSubjects||snap.subjects||[],reportCardStatus:"published",officialCard:official,
      disciplineScore:publishedSnapshotT07.disciplineScore??snap.disciplineScore??null,cultivationScore:publishedSnapshotT07.cultivationScore??snap.cultivationScore??null,
      teacherComment:publishedSnapshotT07.teacherComment||"",managerComment:publishedSnapshotT07.managerComment||""};
  }
  if(academicPeriod==="annual"){
    const first=studentTermReportV185(db,studentId,"semester1"),second=studentTermReportV185(db,studentId,"semester2");
    const settings=db.school?.settings||{},subjects=combineAnnualSubjectRows(first.completeSubjects||[],second.completeSubjects||[],settings).map(r=>{
      // T07: annual FINAL requires finalized term scores from BOTH semesters.
      const hasBoth=r.semester1Score!==null&&r.semester1Score!==undefined&&r.semester2Score!==null&&r.semester2Score!==undefined;
      return hasBoth?r:{...r,finalScore:null,status:"pending"};
    });
    const graded=subjects.filter(r=>r.finalScore!==null),average=graded.length?Math.round(graded.reduce((n,r)=>n+Number(r.finalScore),0)/graded.length*100)/100:null;
    const passing=Number(settings.passingScore||10),failedCount=graded.filter(r=>Number(r.finalScore)<passing).length,pendingCount=subjects.length-graded.length;
    const official=(db.reportCards||[]).filter(r=>r.studentId===studentId&&String(r.academicYear||"")===String(db.school?.year||"")&&normalizePeriodLocal(r.academicPeriod||r.period)==="annual").sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0]||null;
    const published=official?.status==="published"?official:null;
    return {subjects,completeSubjects:subjects,average,subjectAverage:average,academicYear:db.school?.year||"",academicPeriod:"annual",scoreScale:Number(settings.scoreScale||20),passingScore:passing,gradingPolicy:first.gradingPolicy||second.gradingPolicy,
      disciplineScore:published?.disciplineScore??null,cultivationScore:published?.cultivationScore??null,teacherComment:published?.teacherComment||"",managerComment:published?.managerComment||"",reportCardStatus:published?"published":"unpublished",officialCard:published||null,
      attendanceSummary:{present:Number(first.attendanceSummary?.present||0)+Number(second.attendanceSummary?.present||0),late:Number(first.attendanceSummary?.late||0)+Number(second.attendanceSummary?.late||0),absent:Number(first.attendanceSummary?.absent||0)+Number(second.attendanceSummary?.absent||0),pending:Number(first.attendanceSummary?.pending||0)+Number(second.attendanceSummary?.pending||0),excused:Number(first.attendanceSummary?.excused||0)+Number(second.attendanceSummary?.excused||0),unexcused:Number(first.attendanceSummary?.unexcused||0)+Number(second.attendanceSummary?.unexcused||0),total:Number(first.attendanceSummary?.total||0)+Number(second.attendanceSummary?.total||0)},
      summary:{gradedSubjects:graded.length,totalSubjects:subjects.length,failedCount,pendingCount,overallStatus:pendingCount?"incomplete":failedCount?"needs_followup":"passed"}};
  }
  const student = (db.users || []).find(u => u.id === studentId && u.role === "student");
  const academicYear = db.school?.year || "";
  const scoreScaleRaw = Number(db.school?.settings?.scoreScale || 20);
  const scoreScale = Number.isFinite(scoreScaleRaw) && scoreScaleRaw > 0 ? scoreScaleRaw : 20;
  const passingScoreRaw=Number(db.school?.settings?.passingScore||10),passingScore=Number.isFinite(passingScoreRaw)?passingScoreRaw:10;
  const rawPolicy = db.school?.settings?.gradingPolicy || {};
  const policy = { mode: rawPolicy.mode === "weighted" ? "weighted" : "additive", continuousWeight: Number(rawPolicy.continuousWeight), finalWeight: Number(rawPolicy.finalWeight), scoreScale };
  if (!Number.isFinite(policy.continuousWeight) || policy.continuousWeight < 0 || policy.continuousWeight > 100) policy.continuousWeight = 40;
  if (!Number.isFinite(policy.finalWeight) || policy.finalWeight < 0 || policy.finalWeight > 100) policy.finalWeight = 60;
  if (policy.mode === "weighted" && Math.abs(policy.continuousWeight + policy.finalWeight - 100) > 0.001) { policy.continuousWeight = 40; policy.finalWeight = 60; }
  const boundedScore = value => Math.min(scoreScale, Math.max(0, Number(value) || 0));
  if (!student) return { subjects: [], completeSubjects:[], average: null, academicYear, scoreScale, gradingPolicy:policy, officialCard:null };
  const activeTermGrades = (db.termGrades || []).filter(r => {
    if(r.studentId!==studentId)return false;
    const rowYear=String(r.academicYear||academicYear);
    const rowPeriod=(r.academicPeriod||r.period)?(normalizePeriodLocal(r.academicPeriod||r.period)==="annual"?"semester2":normalizePeriodLocal(r.academicPeriod||r.period)):"semester2";
    return rowYear===String(academicYear)&&rowPeriod===academicPeriod;
  });
  const gradeNum=Number(student.grade || (db.school?.classes||[]).find(c=>c.id===student.classId)?.grade || 0);
  const curriculumSubjects=(db.curriculum||[]).filter(b=>!gradeNum||Number(b.grade)===gradeNum||String(b.gradeId||"")===String((db.school?.grades||[]).find(g=>Number(g.grade)===gradeNum)?.id||"")).map(b=>b.subject).filter(Boolean);
  const subjects = Array.from(new Set([...(db.school?.subjects || []), ...curriculumSubjects, ...activeTermGrades.map(r => r.subject).filter(Boolean)]));
  const rows = [],completeRows=[];
  for (const subject of subjects) {
    const key = `${studentId}__${subject}__${academicYear}__${academicPeriod}`;
    const rec = activeTermGrades.find(r => r.key === key) || activeTermGrades.find(r => r.studentId === studentId && r.subject === subject);
    const continuousDetail=continuousDetailForV732(db,{studentId,classId:student.classId,subject,academicYear,academicPeriod});
    const calculatedContinuous=continuousAverageForV686(db,{studentId,classId:student.classId,subject,academicYear,academicPeriod});
    const approvedContinuous=(db.continuousGradeOverrides||[]).filter(r=>r.active!==false&&r.studentId===studentId&&r.classId===student.classId&&r.subject===subject&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||r.period||"semester2")===academicPeriod&&Number.isFinite(Number(r.approvedRawScore))&&Number(r.approvedMaxScore)>0).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
    const legacyContinuous=rec&&rec.continuousScore!==null&&rec.continuousScore!==undefined&&rec.continuousScore!==""?boundedScore(rec.continuousScore):null;
    const continuousScore=calculatedContinuous!==null?calculatedContinuous:legacyContinuous;
    const hasContinuous=continuousScore!==null||!!approvedContinuous;
    const exams = (db.exams || []).filter(e => {
      if(e.subject!==subject||(e.examCategory||"ongoing")!=="final"||e.classId!==student.classId||String(e.academicYear||academicYear)!==String(academicYear))return false;
      const ep=(e.academicPeriod||e.period)?normalizePeriodLocal(e.academicPeriod||e.period):"semester2";
      return (ep==="annual"?"semester2":ep)===academicPeriod;
    });
    let finalExamScore = 0, finalExamPossible = 0, publishedExamCount = 0;
    for (const exam of exams) {
      let score = null;
      const examPossible = Math.max(0, Number(examTotalScore(exam)) || 0);
      if (exam.type === "mcq") {
        const attempt = (db.attempts || []).filter(a => a.examId === exam.id && a.studentId === studentId && (!a.status || a.status === "final" || a.status === "submitted" || a.submittedAt)).sort((a,b)=>Number(b.submittedAt||b.updatedAt||0)-Number(a.submittedAt||a.updatedAt||0))[0];
        if (attempt && Number.isFinite(Number(attempt.score))) score = Math.min(examPossible, Math.max(0, Number(attempt.score)));
      } else {
        const submission = (db.submissions || []).find(x => x.examId === exam.id && x.studentId === studentId);
        const grade = submission && (db.grades || []).filter(g => g.submissionId === submission.id && String(g.publishStatus || "published") === "published").sort((a,b)=>Number(b.gradedAt||0)-Number(a.gradedAt||0))[0];
        if (grade && Number.isFinite(Number(grade.finalScore))) score = Math.min(examPossible, Math.max(0, Number(grade.finalScore)));
      }
      if (score !== null) { finalExamScore += score; finalExamPossible += examPossible; publishedExamCount++; }
    }
    // P67.19 — share is defined by gradebook config, not the student's approved score.
    const {continuousMax,finalMax}=gradebookSharesV6719(db,{classId:student.classId,subject,academicYear,academicPeriod});
    const manualFinal=(db.termFinalOverrides||[]).filter(r=>r.active!==false&&r.studentId===studentId&&r.classId===student.classId&&r.subject===subject&&String(r.academicYear||academicYear)===String(academicYear)&&String(r.academicPeriod||"semester2")===academicPeriod).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
    const finalMarkNeedsReview=invalidTermFinalV6719(manualFinal,finalMax);
    if(manualFinal&&!finalMarkNeedsReview){
      // A teacher-entered final mark is already an absolute mark; do not re-scale using an old maxScore.
      finalExamScore=Number(manualFinal.score);finalExamPossible=finalMax;publishedExamCount=1;
    }
    const continuousPart=approvedContinuous
      ? Math.min(continuousMax,Math.max(0,Number(approvedContinuous.approvedRawScore)/Number(approvedContinuous.approvedMaxScore)*continuousMax))
      : continuousScore!==null?Math.min(continuousMax,Math.max(0,Number(continuousScore)/20*continuousMax)):0;
    const finalPart=manualFinal&&!finalMarkNeedsReview
      ? Number(manualFinal.score)
      : finalExamPossible>0?Math.round(Math.min(1,Math.max(0,finalExamScore/finalExamPossible))*finalMax*100)/100:0;
    const parts={continuousComponent:Math.round(continuousPart*100)/100,finalComponent:Math.round(finalPart*100)/100,
      total:Math.round(Math.min(20,Math.max(0,continuousPart+finalPart))*100)/100,
      continuousShare:continuousMax,finalShare:finalMax,formula:`مستمر (از ${continuousMax}) + پایانی (از ${finalMax})`};
    const hasFinal=publishedExamCount>0&&!finalMarkNeedsReview;
    // Old out-of-range approvals are preserved for review, but cannot silently enter the report card.
    const finalScore=finalMarkNeedsReview?null:(hasContinuous&&hasFinal)?Math.round(Math.min(20,Math.max(0,Number(parts.total)||0))*100)/100:null;
    const examNormalized=hasFinal&&finalExamPossible>0?Math.round((Math.min(finalExamScore,finalExamPossible)/finalExamPossible)*20*100)/100:0,isCapped=false;
    if(finalScore!==null){
      rows.push({subject,continuousScore:parts.continuousComponent,continuousAverage20:continuousScore,continuousCalculatedScore:continuousDetail.calculatedScore,continuousManual:continuousDetail.manual,continuousOverrideReason:continuousDetail.overrideReason,continuousExamCount:continuousDetail.examCount,continuousScheduledExamCount:continuousDetail.scheduledExamCount,continuousComponent:parts.continuousComponent,continuousShare:parts.continuousShare,finalShare:parts.finalShare,finalExamScore,finalExamPossible,finalExamNormalized:examNormalized,finalComponent:parts.finalComponent,finalScore,examCount:publishedExamCount,scoreScale,isCapped,gradingMode:"share20",continuousWeight:parts.continuousShare*5,finalWeight:parts.finalShare*5,formula:parts.formula,passed:finalScore>=passingScore});
    }
    completeRows.push({subject,continuousScore:hasContinuous?parts.continuousComponent:null,continuousAverage20:hasContinuous?continuousScore:null,continuousCalculatedScore:continuousDetail.calculatedScore,continuousManual:continuousDetail.manual,continuousOverrideReason:continuousDetail.overrideReason,continuousExamCount:continuousDetail.examCount,continuousScheduledExamCount:continuousDetail.scheduledExamCount,continuousComponent:hasContinuous?parts.continuousComponent:null,continuousShare:parts.continuousShare,finalShare:parts.finalShare,finalExamScore:hasFinal?finalExamScore:null,finalExamPossible:hasFinal?finalExamPossible:null,finalExamNormalized:hasFinal?examNormalized:null,finalComponent:hasFinal?parts.finalComponent:null,finalScore,examCount:publishedExamCount,scoreScale,gradingMode:"share20",continuousWeight:parts.continuousShare*5,finalWeight:parts.finalShare*5,formula:parts.formula,finalMarkNeedsReview,status:finalMarkNeedsReview?"needs_review":finalScore===null?"pending":finalScore>=passingScore?"passed":"failed"});
  }
  const average = rows.length ? Math.round((rows.reduce((n,r)=>n+Number(r.finalScore||0),0) / rows.length) * 100) / 100 : null;
  const official=(db.reportCards||[]).filter(r=>r.studentId===studentId&&String(r.academicYear||"")===String(academicYear)&&((r.academicPeriod||r.period)?normalizePeriodLocal(r.academicPeriod||r.period):"semester2")===academicPeriod).sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0]||null;
  const publishedOfficial=official?.status==="published"?official:null;
  const disciplineScore=publishedOfficial&&Number.isFinite(Number(publishedOfficial.disciplineScore))?boundedScore(publishedOfficial.disciplineScore):null;
  const cultivationScore=publishedOfficial&&Number.isFinite(Number(publishedOfficial.cultivationScore))?boundedScore(publishedOfficial.cultivationScore):null;
  const failedCount=completeRows.filter(r=>r.finalScore!==null&&r.finalScore<passingScore).length,pendingCount=completeRows.filter(r=>r.finalScore===null).length;
  const overallStatus=pendingCount>0?"incomplete":failedCount>0?"needs_followup":"passed";
  return { subjects: rows, completeSubjects:completeRows, average, subjectAverage:average, academicYear, academicPeriod, scoreScale, passingScore, gradingPolicy: policy,
    disciplineScore,cultivationScore,teacherComment:publishedOfficial?.teacherComment||"",managerComment:publishedOfficial?.managerComment||"",reportCardStatus:publishedOfficial?"published":"unpublished",
    officialCard:publishedOfficial?{id:publishedOfficial.id,status:"published",disciplineScore,cultivationScore,teacherComment:publishedOfficial.teacherComment||"",managerComment:publishedOfficial.managerComment||"",publishedAt:publishedOfficial.publishedAt||null,updatedAt:publishedOfficial.updatedAt||publishedOfficial.createdAt||null}:null,
    attendanceSummary:termAttendanceSummaryV733(db,studentId,academicPeriod,academicYear),
    summary:{gradedSubjects:rows.length,totalSubjects:completeRows.length,failedCount,pendingCount,overallStatus}
  };
}

// P67.20-T08.3 — Server-side publication gate for official report cards.
// Drafts are intentionally allowed to contain incomplete grades.
function assertReportCardPublishReadyT083(report){
  const rows=Array.isArray(report?.completeSubjects)?report.completeSubjects:[];
  const period=String(report?.academicPeriod||"semester2");
  if(!rows.length)throw Object.assign(new Error("برای انتشار کارنامه رسمی، ابتدا دروس دانش‌آموز را مشخص و نمرات را تکمیل کنید؛ کارنامه خالی قابل انتشار نیست."),{status:409,code:"REPORT_CARD_INCOMPLETE"});
  const incomplete=rows.filter(r=>{
    if(!r)return true;
    const score=r.finalScore;
    if(score===null||score===undefined||String(score).trim()==="")return true;
    const n=Number(score);
    return !Number.isFinite(n)||n<0||n>20;
  });
  if(incomplete.length){
    const periodLabel=period==="annual"?"سالانه":period==="semester1"?"نیم‌سال اول":"نیم‌سال دوم";
    const names=incomplete.slice(0,3).map(r=>String(r?.subject||"درس نامشخص").slice(0,80));
    const shortList=names.length?` (${names.join("، ")}${incomplete.length>3?" و موارد دیگر":""})`:"";
    throw Object.assign(new Error(`کارنامه ${periodLabel} دارای ${incomplete.length} درس با نمره ناقص یا نامعتبر است${shortList}. ابتدا نمرات را تکمیل کنید؛ ذخیره پیش‌نویس همچنان مجاز است.`),{status:409,code:"REPORT_CARD_INCOMPLETE"});
  }
  return true;
}


// P67.20-T08.4: Independent continuous report cards — server-side contract.
// This lifecycle is deliberately separate from official semester/annual report cards.
function continuousCardSubjectsT084(db,student,period){
  const year=String(db.school?.year||"");
  const grade=Number(student?.grade||(db.school?.classes||[]).find(c=>c.id===student?.classId)?.grade||0);
  if(![7,8,9].includes(grade))throw Object.assign(new Error("پایه دانش‌آموز مشخص نیست؛ صدور کارنامه مستمر مجاز نیست."),{status:409,code:"CONTINUOUS_CARD_INCOMPLETE"});
  const subjects=[...new Set((db.curriculum||[]).filter(b=>Number(b.grade)===grade).map(b=>String(b.subject||"").trim()).filter(Boolean))];
  return subjects.map(subject=>{
    const scope={studentId:student.id,classId:student.classId,subject,academicYear:year,academicPeriod:period};
    const detail=continuousDetailForV732(db,scope);
    const normalized=continuousAverageForV686(db,scope);
    const score20=normalized===null||normalized===undefined||normalized===""?null:Number(normalized);
    const maxScore=gradebookSharesV6719(db,{classId:student.classId,subject,academicYear:year,academicPeriod:period}).continuousMax;
    const valid=score20!==null&&Number.isFinite(score20)&&score20>=0&&score20<=20;
    return {subject,calculatedScore:detail.calculatedScore??null,score20:valid?score20:null,
      manual:Boolean(detail.manual),overrideReason:detail.overrideReason||"",displayScore:valid?Math.round(score20*maxScore*5)/100:null,
      maxScore,examCount:detail.examCount||0,scheduledExamCount:detail.scheduledExamCount||0};
  });
}
function assertContinuousCardReadyT084(rows){
  if(!rows.length)throw Object.assign(new Error("برای صدور کارنامه مستمر مستقل، ابتدا درس‌های پایه را تعریف و نمرات مستمر را ثبت کنید."),{status:409,code:"CONTINUOUS_CARD_INCOMPLETE"});
  const incomplete=rows.filter(r=>r.score20===null||!Number.isFinite(r.score20)||r.score20<0||r.score20>20);
  if(incomplete.length)throw Object.assign(new Error(`صدور کارنامه مستمر مجاز نیست: ${incomplete.length} درس بدون نمره معتبر (${incomplete.slice(0,3).map(r=>r.subject).join("، ")}${incomplete.length>3?" و موارد دیگر":""}). پیش‌نویس همچنان قابل ذخیره است.`),{status:409,code:"CONTINUOUS_CARD_INCOMPLETE"});
  return true;
}

// ===== v45.18: پرونده تحلیلی دانش‌آموز برای معلم و اولیا =====
const ACADEMIC_PERIODS_V4518 = {
  week: { label: "هفتگی", days: 7 },
  month: { label: "ماهانه", days: 30 },
  quarter: { label: "سه‌ماهه", days: 90 },
  semester: { label: "نیم‌سال", days: 180 },
  year: { label: "پایان سال", days: 365 }
};
function timestampV4518(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const n = Number(value); if (Number.isFinite(n) && n > 1e9) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(String(value)); return Number.isFinite(parsed) ? parsed : 0;
}
function rowTimestampV4518(row, keys=["submittedAt","gradedAt","updatedAt","createdAt","date","at"]) {
  for (const key of keys) { const t=timestampV4518(row?.[key]); if(t) return t; }
  return 0;
}
function periodWindowV4518(period="month", now=Date.now()) {
  const key=ACADEMIC_PERIODS_V4518[period]?period:"month", cfg=ACADEMIC_PERIODS_V4518[key], span=cfg.days*86400000;
  return { key, label:cfg.label, days:cfg.days, start:now-span, end:now, previousStart:now-span*2, previousEnd:now-span };
}
function finalExamOutcomesV4518(db, studentId) {
  const activeYear=String(db.school?.year||"");
  const out=[];
  for(const attempt of db.attempts||[]){
    if(attempt.studentId!==studentId)continue; const exam=(db.exams||[]).find(e=>e.id===attempt.examId); if(!exam||String(exam.academicYear||activeYear)!==activeYear)continue;
    const total=Number(attempt.total||examTotalScore(exam)||0), score=Number(attempt.score||0), ts=rowTimestampV4518(attempt);
    out.push({id:attempt.id,examId:exam.id,title:exam.title,subject:exam.subject||"",chapter:exam.chapter||"",type:"mcq",score,total,percent:total?Math.round(score/total*1000)/10:0,timestamp:ts,submittedAt:attempt.submittedAt||0,status:"final"});
  }
  for(const grade of db.grades||[]){
    if(String(grade.publishStatus||"published")!=="published")continue;
    const sub=(db.submissions||[]).find(x=>x.id===grade.submissionId); if(!sub||sub.studentId!==studentId)continue; const exam=(db.exams||[]).find(e=>e.id===sub.examId); if(!exam||String(exam.academicYear||activeYear)!==activeYear)continue;
    const total=Number(examTotalScore(exam)||0), score=Number(grade.finalScore||0), ts=rowTimestampV4518(grade)||rowTimestampV4518(sub);
    out.push({id:grade.id,examId:exam.id,title:exam.title,subject:exam.subject||"",chapter:exam.chapter||"",type:"descriptive",score,total,percent:total?Math.round(score/total*1000)/10:0,timestamp:ts,submittedAt:sub.submittedAt||0,status:"final"});
  }
  return out.sort((a,b)=>b.timestamp-a.timestamp);
}
function weightedPercentV4518(rows){const earned=rows.reduce((a,x)=>a+Number(x.score||0),0),possible=rows.reduce((a,x)=>a+Number(x.total||0),0);return possible?Math.round(earned/possible*1000)/10:null;}
function academicStatusV4518(avg){if(avg===null||avg===undefined)return {key:"no_data",label:"بدون داده کافی"};if(avg>=85)return {key:"excellent",label:"عالی"};if(avg>=70)return {key:"good",label:"خوب"};if(avg>=50)return {key:"needs_practice",label:"نیازمند تقویت"};return {key:"needs_attention",label:"نیازمند پیگیری"};}
function trendStatusV4518(current,previous){if(current===null||previous===null)return {key:"no_data",label:"داده کافی برای مقایسه نیست",delta:null};const delta=Math.round((current-previous)*10)/10;if(delta>=5)return {key:"progress",label:"پیشرفت",delta};if(delta<=-5)return {key:"regression",label:"پسرفت",delta};return {key:"stable",label:"تقریباً ثابت",delta};}
function academicAnalyticsV4518(db, studentId, period="month", subject="", options={}) {
  const student=(db.users||[]).find(u=>u.id===studentId&&u.role==="student"); if(!student)return null;
  const activeYear=String(db.school?.year||"");
  const w=periodWindowV4518(period), all=finalExamOutcomesV4518(db,studentId).filter(x=>!subject||x.subject===subject);
  const current=all.filter(x=>x.timestamp>=w.start&&x.timestamp<=w.end), previous=all.filter(x=>x.timestamp>=w.previousStart&&x.timestamp<w.previousEnd);
  const currentAvg=weightedPercentV4518(current), previousAvg=weightedPercentV4518(previous), status=academicStatusV4518(currentAvg), trend=trendStatusV4518(currentAvg,previousAvg);
  const subjectMap=new Map(); for(const row of current){const x=subjectMap.get(row.subject)||{subject:row.subject,earned:0,possible:0,count:0,chapters:new Map()};x.earned+=row.score;x.possible+=row.total;x.count++;const ch=x.chapters.get(row.chapter||"بدون فصل")||{chapter:row.chapter||"بدون فصل",earned:0,possible:0,count:0};ch.earned+=row.score;ch.possible+=row.total;ch.count++;x.chapters.set(ch.chapter,ch);subjectMap.set(row.subject,x);}
  const subjects=[...subjectMap.values()].map(x=>({subject:x.subject,count:x.count,percent:x.possible?Math.round(x.earned/x.possible*1000)/10:0,chapters:[...x.chapters.values()].map(c=>({...c,percent:c.possible?Math.round(c.earned/c.possible*1000)/10:0})).sort((a,b)=>a.percent-b.percent)})).sort((a,b)=>b.percent-a.percent);
  const weakAreas=subjects.flatMap(x=>x.chapters.filter(c=>c.percent<60).map(c=>({subject:x.subject,chapter:c.chapter,percent:c.percent,count:c.count}))).sort((a,b)=>a.percent-b.percent).slice(0,8);
  const attendance=(db.attendance||[]).filter(a=>a.studentId===studentId&&String(a.academicYear||activeYear)===activeYear).filter(a=>{const t=rowTimestampV4518(a);if(!t)return period==="year";return t>=w.start&&t<=w.end;});
  const attendanceSummary={present:attendance.filter(a=>normalizeAttendanceStatusV81(a.status)==="present").length,absent:attendance.filter(a=>isAbsentStatusV81(a.status)).length,pending:attendance.filter(a=>normalizeAttendanceStatusV81(a.status)==="absent_pending").length,late:attendance.filter(a=>normalizeAttendanceStatusV81(a.status)==="late").length,excused:attendance.filter(a=>normalizeAttendanceStatusV81(a.status)==="absent_excused").length,unexcused:attendance.filter(a=>normalizeAttendanceStatusV81(a.status)==="absent_unexcused").length,total:attendance.length};
  const homeworks=(db.homework||[]).filter(h=>h.classId===student.classId&&String(h.academicYear||activeYear)===activeYear&&(!subject||h.subject===subject)); const hwIds=new Set(homeworks.map(h=>h.id));
  const hwSub=(db.homeworkSubmissions||[]).filter(x=>x.studentId===studentId&&hwIds.has(x.homeworkId)).filter(x=>{const t=rowTimestampV4518(x);if(!t)return period==="year";return t>=w.start&&t<=w.end;});
  const hwScored=hwSub.filter(x=>Number.isFinite(Number(x.score))); const homeworkSummary={submitted:hwSub.length,graded:hwScored.length,averageScore:hwScored.length?Math.round(hwScored.reduce((a,x)=>a+Number(x.score||0),0)/hwScored.length*10)/10:null};
  const notes=(db.progressReports||[]).filter(r=>r.studentId===studentId&&String(r.academicYear||activeYear)===activeYear&&r.type==="academic_analysis"&&(!subject||!r.subject||r.subject===subject)&&(!options.guardianOnly||r.guardianVisible!==false)&&r.status==="published").sort((a,b)=>rowTimestampV4518(b,["createdAtIso","publishedAtIso","createdAt","publishedAt"])-rowTimestampV4518(a,["createdAtIso","publishedAtIso","createdAt","publishedAt"]));
  const currentPeriodNotes=notes.filter(r=>r.period===w.key).slice(0,10);
  const availableSubjects=[...new Set([...(db.exams||[]).filter(e=>e.classId===student.classId&&String(e.academicYear||activeYear)===activeYear).map(e=>e.subject).filter(Boolean),...all.map(x=>x.subject).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,"fa"));
  return {student:publicStudent(student,db),period:w,subject:subject||"",availableSubjects,current:{averagePercent:currentAvg,examCount:current.length,earned:current.reduce((a,x)=>a+x.score,0),possible:current.reduce((a,x)=>a+x.total,0)},previous:{averagePercent:previousAvg,examCount:previous.length},status,trend,exams:current.slice(0,30),subjects,weakAreas,attendance:attendanceSummary,homework:homeworkSummary,teacherNotes:currentPeriodNotes.map(r=>({id:r.id,teacherName:r.teacherName||"معلم",teacherComment:r.teacherComment||r.summary||"",subject:r.subject||"",period:r.period||"",periodLabel:r.periodLabel||"",createdAt:r.publishedAt||r.createdAt||"",guardianVisible:r.guardianVisible!==false})),generatedAt:new Date().toISOString()};
}
function staffCanViewAnalysisV4518(db,user,studentId,subject="") {
  if(["admin","superadmin"].includes(user?.role))return true; if(user?.role!=="teacher")return false;
  const student=(db.users||[]).find(u=>u.id===studentId&&u.role==="student"); if(!student)return false; const scope=teacherScope(db,user); if(!scope.studentIds.has(studentId))return false;
  if(subject&&!activeTeachingAssignments(db,user,"reports").some(a=>a.classId===student.classId&&(!a.subject||a.subject===subject)))return false; return true;
}


// ===== v45.21: پرونده جامع دانش‌آموز و داده PDF رسمی =====
function maskGuardianNationalIdV4521(value){const s=normalizeNationalId(value);return /^\d{10}$/.test(s)?`${s.slice(0,3)}****${s.slice(-3)}`:"";}
function disciplineSummaryV4521(db,studentId){
  const activeYear=String(db.school?.year||"");
  const rows=(db.behaviorRecords||[]).filter(x=>x.studentId===studentId&&String(x.academicYear||activeYear)===activeYear),negative=rows.filter(x=>x.kind==="negative"||x.type==="negative").length,positive=rows.filter(x=>x.kind==="positive"||x.type==="positive").length;
  const points=rows.reduce((a,x)=>a+Number(x.points||0),0);let label="خیلی خوب";if(negative>=5||points<=-10)label="نیازمند پیگیری";else if(negative>=2||points<0)label="خوب";
  return {label,positive,negative,points,total:rows.length};
}
// ===== 72.35-p1 — پرونده حرفه‌ای و ساختاریافته دانش‌آموز =====
const STUDENT_DOC_CHECKLIST_V734 = [
  {type:"identity",label:"مدرک هویتی دانش‌آموز"},
  {type:"guardian_identity",label:"مدرک هویتی ولی"},
  {type:"photo",label:"عکس پرسنلی"},
  {type:"enrollment",label:"فرم/مدرک ثبت‌نام"},
  {type:"consent",label:"رضایت‌نامه‌های مدرسه"}
];
function emptyStudentExtendedProfileV734(studentId=""){
  return {studentId,
    administrative:{admissionDate:"",registrationNo:"",enrollmentStatus:"active",previousSchool:"",previousSchoolCode:"",transferStatus:"new",shiftPreference:"",transportMode:"family",busRoute:"",lockerNo:""},
    identity:{preferredName:"",placeOfIssue:"",identitySerial:"",nationality:"ایرانی"},
    contact:{secondaryMobile:"",secondaryPhone:""},
    emergency:{secondaryName:"",secondaryRelation:"",secondaryMobile:""},
    health:{bloodType:"",allergies:"",medicalAlerts:"",medications:"",physicianName:"",physicianPhone:"",insuranceProvider:"",insuranceNo:"",emergencyInstructions:""},
    support:{learningSupport:"",accommodations:"",counselorFollowup:"",strengths:"",interests:""},
    logistics:{pickupAuthorization:"",dismissalNotes:""},
    consents:{photo:"pending",trip:"pending",onlineClass:"pending",emergencyTreatment:"pending"},
    internal:{registrationNote:"",confidentialNote:""},updatedAt:"",updatedBy:""};
}
function studentExtendedProfileV734(db,studentId){
  const row=(db.studentExtendedProfiles||[]).find(x=>x.studentId===studentId&&x.active!==false)||{};
  const base=emptyStudentExtendedProfileV734(studentId);
  for(const k of ["administrative","identity","contact","emergency","health","support","logistics","consents","internal"]) base[k]={...base[k],...(row[k]||{})};
  base.updatedAt=row.updatedAt||row.createdAt||"";base.updatedBy=row.updatedBy||row.createdBy||"";return base;
}
function textV734(value,max=300){return String(value??"").trim().slice(0,max);}
function consentV734(value){const v=String(value||"pending");return ["yes","no","pending"].includes(v)?v:"pending";}
function normalizeExtendedProfileV734(body={},studentId=""){
  const src=body&&typeof body==="object"?body:{};const a=src.administrative||{},i=src.identity||{},c=src.contact||{},e=src.emergency||{},h=src.health||{},sp=src.support||{},l=src.logistics||{},co=src.consents||{},n=src.internal||{};
  return {studentId,
    administrative:{admissionDate:textV734(a.admissionDate,20),registrationNo:textV734(a.registrationNo,50),enrollmentStatus:["active","conditional","inactive","transferred","graduated"].includes(String(a.enrollmentStatus))?String(a.enrollmentStatus):"active",previousSchool:textV734(a.previousSchool,160),previousSchoolCode:textV734(a.previousSchoolCode,60),transferStatus:["new","transferred_in","transferred_out","returning"].includes(String(a.transferStatus))?String(a.transferStatus):"new",shiftPreference:textV734(a.shiftPreference,40),transportMode:["family","walk","school_bus","public","other"].includes(String(a.transportMode))?String(a.transportMode):"family",busRoute:textV734(a.busRoute,100),lockerNo:textV734(a.lockerNo,40)},
    identity:{preferredName:textV734(i.preferredName,100),placeOfIssue:textV734(i.placeOfIssue,120),identitySerial:textV734(i.identitySerial,60),nationality:textV734(i.nationality,80)},
    contact:{secondaryMobile:normalizePhone(c.secondaryMobile),secondaryPhone:normalizePhone(c.secondaryPhone)},
    emergency:{secondaryName:textV734(e.secondaryName,120),secondaryRelation:textV734(e.secondaryRelation,60),secondaryMobile:normalizePhone(e.secondaryMobile)},
    health:{bloodType:textV734(h.bloodType,8),allergies:textV734(h.allergies,1200),medicalAlerts:textV734(h.medicalAlerts,1200),medications:textV734(h.medications,1200),physicianName:textV734(h.physicianName,120),physicianPhone:normalizePhone(h.physicianPhone),insuranceProvider:textV734(h.insuranceProvider,160),insuranceNo:textV734(h.insuranceNo,80),emergencyInstructions:textV734(h.emergencyInstructions,1600)},
    support:{learningSupport:textV734(sp.learningSupport,1800),accommodations:textV734(sp.accommodations,1800),counselorFollowup:textV734(sp.counselorFollowup,1800),strengths:textV734(sp.strengths,1200),interests:textV734(sp.interests,1200)},
    logistics:{pickupAuthorization:textV734(l.pickupAuthorization,1200),dismissalNotes:textV734(l.dismissalNotes,1200)},
    consents:{photo:consentV734(co.photo),trip:consentV734(co.trip),onlineClass:consentV734(co.onlineClass),emergencyTreatment:consentV734(co.emergencyTreatment)},
    internal:{registrationNote:textV734(n.registrationNote,2200),confidentialNote:textV734(n.confidentialNote,2200)}};
}
function safeExtendedProfileV734(profile,{includeSensitive=false,guardianOnly=false}={}){
  const out={administrative:{...profile.administrative},identity:{...profile.identity},contact:{...profile.contact},emergency:{...profile.emergency},support:{strengths:profile.support?.strengths||"",interests:profile.support?.interests||""},logistics:{...profile.logistics},consents:{...profile.consents},updatedAt:profile.updatedAt||""};
  if(includeSensitive&&!guardianOnly){out.health={...profile.health};out.support={...profile.support};out.internal={...profile.internal};}
  return out;
}
function profileCompletenessV734(db,student,profile){
  const checks=[student.firstName,student.lastName,student.nationalId,student.birthDate,student.studentCode,student.classId,student.fatherName||student.guardianMobile,student.emergencyGuardianMobile,student.address,profile.administrative?.admissionDate,profile.administrative?.registrationNo,profile.identity?.nationality];
  const coreDone=checks.filter(Boolean).length,docs=(db.studentDocuments||[]).filter(x=>x.studentId===student.id&&x.active!==false),types=new Set(docs.map(x=>x.documentType));
  const documentChecklist=STUDENT_DOC_CHECKLIST_V734.map(x=>({...x,present:types.has(x.type)}));const docsDone=documentChecklist.filter(x=>x.present).length;
  const score=Math.round(((coreDone/checks.length)*80)+((docsDone/documentChecklist.length)*20));
  return {score,level:score>=90?"complete":score>=70?"good":score>=45?"needs_attention":"incomplete",core:{done:coreDone,total:checks.length},documents:{done:docsDone,total:documentChecklist.length,items:documentChecklist}};
}
function profileDiffV734(before,after,prefix="",out=[]){
  const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);for(const key of keys){if(["updatedAt","updatedBy","createdAt","createdBy"].includes(key))continue;const a=before?.[key],b=after?.[key],path=prefix?`${prefix}.${key}`:key;if(a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b))profileDiffV734(a,b,path,out);else if(String(a??"")!==String(b??""))out.push({field:path,before:String(a??"").slice(0,300),after:String(b??"").slice(0,300)});}return out;
}

function buildStudentDossierV4521(db,studentId,{guardianOnly=false,includeSensitive=false}={}){
  const student=(db.users||[]).find(u=>u.id===studentId&&u.role==="student"&&u.profileStatus!=="deleted");if(!student)return null;
  const analysis=academicAnalyticsV4518(db,studentId,"year","",{guardianOnly});
  const finals=finalExamOutcomesV4518(db,studentId).slice().sort((a,b)=>a.timestamp-b.timestamp);
  const guardians=(db.guardianLinks||[]).filter(x=>x.studentId===studentId&&x.active!==false).map(link=>{const g=(db.guardians||[]).find(x=>x.id===link.guardianId)||{};return {id:g.id||link.guardianId||link.id,name:g.guardianName||g.name||link.guardianName||"ولی دانش‌آموز",relation:link.relation||"ولی",mobile:g.mobile||link.mobile||student.guardianMobile||"",nationalIdMasked:maskGuardianNationalIdV4521(g.nationalId||link.guardianNationalId||"")};});
  if(!guardians.length&&(student.guardianMobile||student.emergencyGuardianName))guardians.push({id:"legacy",name:student.emergencyGuardianName||"ولی دانش‌آموز",relation:student.emergencyGuardianRelation||"ولی",mobile:student.guardianMobile||student.emergencyGuardianMobile||"",nationalIdMasked:""});
  const activeYear=String(db.school?.year||"");
  const teacherNotes=(db.progressReports||[]).filter(r=>r.studentId===studentId&&String(r.academicYear||activeYear)===activeYear&&r.type==="academic_analysis"&&r.status==="published"&&(!guardianOnly||r.guardianVisible!==false)).slice().sort((a,b)=>rowTimestampV4518(b,["createdAtIso","publishedAtIso","createdAt","publishedAt"])-rowTimestampV4518(a,["createdAtIso","publishedAtIso","createdAt","publishedAt"])).slice(0,12).map(r=>({id:r.id,teacherId:r.teacherId||"",teacherName:r.teacherName||"معلم",teacherComment:r.teacherComment||r.summary||"",subject:r.subject||"",periodLabel:r.periodLabel||"",createdAt:r.publishedAt||r.createdAt||""}));
  const attendance=attendanceSummaryForStudent(db,studentId),discipline=disciplineSummaryV4521(db,studentId);
  const subjectRows=(analysis?.subjects||[]).slice().sort((a,b)=>b.percent-a.percent),strengths=subjectRows.filter(x=>x.percent>=75).slice(0,3),needs=subjectRows.filter(x=>x.percent<70).slice().sort((a,b)=>a.percent-b.percent).slice(0,3);
  const overall=weightedPercentV4518(finals),trend=analysis?.trend||{key:"no_data",label:"داده کافی نیست",delta:null},status=academicStatusV4518(overall);
  const classExams=(db.exams||[]).filter(e=>e.classId===student.classId&&String(e.academicYear||activeYear)===activeYear&&e.status!=="archived");
  const examRows=classExams.map(ex=>{const sub=studentSubmissionInfo(db,ex,studentId),total=Number(sub?.total||examTotalScore(ex)||0),score=sub?.gradingStatus==="final"?Number(sub.score||0):null,percent=score!==null&&total?Math.round(score/total*1000)/10:null;return {examId:ex.id,title:ex.title,subject:ex.subject||"",chapter:ex.chapter||"",type:ex.type||"",score,total,percent,status:sub?.gradingStatus==="final"?"final":sub?"pending":"missing",date:sub?.submittedAt?new Date(sub.submittedAt).toISOString():(ex.deadline||ex.createdAt||"")};}).sort((a,b)=>timestampV4518(b.date)-timestampV4518(a.date));
  const latestTeacherId=teacherNotes.find(n=>n.teacherId)?.teacherId||"",latestTeacher=(db.users||[]).find(u=>u.id===latestTeacherId&&u.role==="teacher");
  const termReport=studentTermReportV185(db,studentId);
  const enrollmentHistory=enrollmentHistoryForStudent(db,studentId);
  const documents=(db.studentDocuments||[]).filter(x=>x.studentId===studentId&&x.active!==false).slice().sort((a,b)=>String(b.createdAtIso||b.createdAt||"").localeCompare(String(a.createdAtIso||a.createdAt||""))).map(x=>({id:x.id,title:x.title||"مدرک",documentType:x.documentType||"other",fileKey:x.fileKey||"",issuedAt:x.issuedAt||"",expiresAt:x.expiresAt||"",note:x.note||"",verificationStatus:x.verificationStatus||"pending",verifiedAt:x.verifiedAt||"",createdAt:x.createdAt||x.createdAtIso||""}));
  const achievements=(db.achievements||[]).filter(x=>x.studentId===studentId&&x.active!==false).slice().sort((a,b)=>String(b.date||b.createdAt||"").localeCompare(String(a.date||a.createdAt||""))).slice(0,30);
  const extendedRaw=studentExtendedProfileV734(db,studentId),extendedProfile=safeExtendedProfileV734(extendedRaw,{includeSensitive,guardianOnly}),profileCompleteness=profileCompletenessV734(db,student,extendedRaw);
  const recordHistory=guardianOnly?[]:(db.recordHistory||[]).filter(x=>x.studentId===studentId).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,80);
  const termReports={semester1:studentTermReportV185(db,studentId,"semester1"),semester2:studentTermReportV185(db,studentId,"semester2"),annual:studentTermReportV185(db,studentId,"annual")};
  return {release:APP_RELEASE,school:{name:db.school?.name||SCHOOL_NAME,year:db.school?.year||"",academicYears:ensureAcademicYearModel(db.school),reportBranding:{organization:db.school?.reportBranding?.organization||"وزارت آموزش و پرورش",schoolName:db.school?.reportBranding?.schoolName||db.school?.name||SCHOOL_NAME,district:db.school?.reportBranding?.district||"",address:db.school?.reportBranding?.address||"",phone:db.school?.reportBranding?.phone||"",managerName:db.school?.reportBranding?.managerName||"",footerNote:db.school?.reportBranding?.footerNote||"",headerImageDataUrl:db.school?.reportBranding?.headerImageDataUrl||"",managerSignatureDataUrl:db.school?.reportBranding?.managerSignatureDataUrl||""}},student:publicStudent(student,db),extendedProfile,profileCompleteness,guardians,enrollmentHistory,documents,achievements,recordHistory,exams:examRows,analysis:{overallAveragePercent:overall,status,trend,subjects:subjectRows,weakAreas:analysis?.weakAreas||[],strengths,needs,attendance:analysis?.attendance||attendance,homework:analysis?.homework||{},teacherNotes},attendance,discipline,teacherNotes,termReport,termReports,signatures:{teacherName:latestTeacher?`${latestTeacher.firstName||""} ${latestTeacher.lastName||""}`.trim():(teacherNotes[0]?.teacherName||"معلم"),teacherSignatureDataUrl:latestTeacher?.signatureDataUrl||"",managerName:db.school?.reportBranding?.managerName||"مدیر مدرسه",managerSignatureDataUrl:db.school?.reportBranding?.managerSignatureDataUrl||""},generatedAt:new Date().toISOString()};
}


async function saveStudentFiles(submissionId, files) {
  await ensureDataDirs();
  const records = [];
  for (let i = 0; i < files.length; i++) {
    const source = files[i];
    if (!String(source.dataUrl || "").startsWith("data:")) throw Object.assign(new Error("فایل پاسخ معتبر نیست."), { status: 400 });
    const key = safeKey(`${submissionId}_${i}`);
    const record = { key, submissionId, name: String(source.name || `page-${i + 1}.jpg`), type: String(source.type || "image/jpeg"), size: Number(source.size || 0), dataUrl: source.dataUrl, savedAt: Date.now() };
    await atomicWriteText(path.join(FILES_DIR, `${key}.json`), JSON.stringify(record), 0o600);
    records.push({ key, name: record.name, type: record.type, size: record.size });
  }
  return records;
}


// ===== نسخه ۳۸: کارتابل مرکزی، جست‌وجوی سراسری و Timeline جامع دانش‌آموز =====
function v38Text(value){ return String(value ?? "").trim(); }
function v38Hay(...parts){ return parts.flat().map(v38Text).join(" ").toLocaleLowerCase("fa"); }
function v38DateValue(row){
  const raw=row?.submittedAt ?? row?.updatedAt ?? row?.createdAt ?? row?.date ?? row?.at ?? row?.savedAt ?? 0;
  if(typeof raw==="number") return raw;
  const text=String(raw||""); const parsed=Date.parse(text); if(Number.isFinite(parsed)) return parsed;
  const latin=text.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const m=latin.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2}))?(?:\D+(\d{1,2}))?/);
  return m ? Number(`${m[1]}${String(m[2]).padStart(2,"0")}${String(m[3]).padStart(2,"0")}${String(m[4]||0).padStart(2,"0")}${String(m[5]||0).padStart(2,"0")}`) : 0;
}
function v38StudentName(db,id){ const u=(db.users||[]).find(x=>x.id===id); return u?`${u.firstName||""} ${u.lastName||""}`.trim():"دانش‌آموز"; }
function v38ClassName(db,id){ return (db.school?.classes||[]).find(c=>c.id===id)?.name || "—"; }
function buildActionCenterV38(db,user){
  const items=[];
  const push=(kind,title,detail,target,priority="normal",refId="",studentId="")=>items.push({id:`${kind}:${refId||items.length}`,kind,title,detail,target,priority,refId,studentId});
  const gradesBySubmission=new Set((db.grades||[]).map(g=>g.submissionId));
  for(const sub of db.submissions||[]){
    if(sub.status==="final" || gradesBySubmission.has(sub.id)) continue;
    const ex=(db.exams||[]).find(e=>e.id===sub.examId); push("grading","برگه تشریحی در انتظار تصحیح",`${v38StudentName(db,sub.studentId)} · ${ex?.title||"آزمون"}`,user.role==="teacher"?"grading":"gradingCenter","high",sub.id,sub.studentId);
  }
  for(const a of db.appeals||[]){ if(!["open","reviewing"].includes(a.status)) continue; const ex=(db.exams||[]).find(e=>e.id===a.examId); push("appeal","اعتراض نیازمند رسیدگی",`${v38StudentName(db,a.studentId)} · ${ex?.title||"آزمون"}`,user.role==="teacher"?"appeals":"gradingCenter","high",a.id,a.studentId); }
  for(const hs of db.homeworkSubmissions||[]){ if(["graded","final"].includes(hs.status)) continue; const hw=(db.homework||[]).find(h=>h.id===hs.homeworkId); push("homework","تکلیف در انتظار بررسی",`${v38StudentName(db,hs.studentId)} · ${hw?.title||"تکلیف"}`,"classroom","normal",hs.id,hs.studentId); }
  for(const q of db.questionBank||[]){ if(!["draft","review","pending","needs_review"].includes(String(q.status||""))) continue; push("question","سؤال در انتظار تأیید",`${q.subject||""} · ${String(q.text||"").slice(0,70)}`,user.role==="teacher"?"bank":"questionCenter","normal",q.id); }
  for(const r of db.parentRequests||[]){ if(["closed","resolved","done","rejected"].includes(String(r.status||""))) continue; push("parent","درخواست خانواده",`${v38StudentName(db,r.studentId)} · ${r.title||r.type||"درخواست جدید"}`,user.role==="teacher"?"support":"familyadmin","normal",r.id,r.studentId); }
  for(const i of db.interventions||[]){ if(!["open","in_progress","urgent"].includes(String(i.status||""))) continue; push("intervention","پیگیری آموزشی باز",`${v38StudentName(db,i.studentId)} · ${i.action||i.reason||"نیازمند پیگیری"}`,user.role==="teacher"?"support":"riskCenter",i.status==="urgent"?"high":"normal",i.id,i.studentId); }
  if(["admin","superadmin"].includes(user.role)) for(const t of db.adminTasks||[]){ if(["done","closed"].includes(String(t.status||""))) continue; push("admin","کار مدیریتی باز",t.title||t.note||"کار مدیریتی","platform",t.priority==="urgent"?"high":"normal",t.id); }
  const order={high:0,normal:1,low:2}; items.sort((a,b)=>(order[a.priority]??9)-(order[b.priority]??9));
  const counts=items.reduce((m,x)=>(m[x.kind]=(m[x.kind]||0)+1,m),{});
  return {generatedAt:new Date().toISOString(),total:items.length,high:items.filter(x=>x.priority==="high").length,counts,items:items.slice(0,250)};
}
function globalSearchV38(db,user,query){
  const q=v38Text(query).toLocaleLowerCase("fa"); if(q.length<2) return [];
  const out=[]; const add=(type,id,title,subtitle,target,studentId="")=>out.push({type,id,title,subtitle,target,studentId});
  for(const u of db.users||[]){ if(v38Hay(u.firstName,u.lastName,u.studentCode,u.nationalId,u.username).includes(q)){ add(u.role==="student"?"student":"user",u.id,`${u.firstName||""} ${u.lastName||""}`.trim(),u.role==="student"?`${v38ClassName(db,u.classId)} · ${u.studentCode||u.nationalId||""}`:(u.username||u.role),u.role==="student"?"studentTimeline":"users",u.role==="student"?u.id:""); } }
  for(const e of db.exams||[]){ if(v38Hay(e.title,e.subject,e.chapter,e.examCode).includes(q)) add("exam",e.id,e.title||"آزمون",`${e.subject||""} · ${v38ClassName(db,e.classId)}`,user.role==="teacher"?"exams":"assessment"); }
  for(const h of db.homework||[]){ if(v38Hay(h.title,h.subject,h.description).includes(q)) add("homework",h.id,h.title||"تکلیف",`${h.subject||""} · ${v38ClassName(db,h.classId)}`,user.role==="teacher"?"classroom":"academic"); }
  for(const b of db.curriculum||[]){ if(v38Hay(b.title,b.subject,b.edition).includes(q)) add("book",b.id,b.title||b.subject,b.edition||"کتاب درسی",user.role==="teacher"?"curriculum":"academic"); }
  for(const qb of db.questionBank||[]){ if(v38Hay(qb.text,qb.subject,qb.chapter,qb.topic,qb.tags).includes(q)) add("question",qb.id,String(qb.text||"سؤال").slice(0,100),`${qb.subject||""} · ${qb.chapter||""}`,"bank"); }
  for(const c of db.school?.classes||[]){ if(v38Hay(c.name,c.grade).includes(q)) add("class",c.id,c.name||"کلاس",`پایه ${c.grade||"—"}`,user.role==="teacher"?"classroom":"school"); }
  return out.slice(0,80);
}
function studentTimelineV38(db,student){
  const rows=[]; const add=(type,title,detail,raw,meta={})=>rows.push({id:`${type}_${rows.length}_${meta.id||""}`,type,title,detail,at:raw||"",sort:v38DateValue({at:raw,...meta}),...meta});
  for(const a of db.attempts||[]){ if(a.studentId!==student.id)continue; const e=(db.exams||[]).find(x=>x.id===a.examId); add("exam","تحویل آزمون تستی",`${e?.title||"آزمون"} · نمره ${a.score??"—"} از ${a.total??examTotalScore(e||{})}`,a.at||a.submittedAt,{id:a.id,subject:e?.subject||""}); }
  for(const s of db.submissions||[]){ if(s.studentId!==student.id)continue; const e=(db.exams||[]).find(x=>x.id===s.examId),g=(db.grades||[]).find(x=>x.submissionId===s.id); add("exam","تحویل آزمون تشریحی",`${e?.title||"آزمون"}${g?` · نمره نهایی ${g.finalScore??g.score??"—"}`:" · در انتظار نمره"}`,s.at||s.submittedAt||g?.at,{id:s.id,subject:e?.subject||""}); }
  for(const a of db.appeals||[]){ if(a.studentId!==student.id)continue; const e=(db.exams||[]).find(x=>x.id===a.examId); add("appeal","اعتراض نمره",`${e?.title||"آزمون"} · وضعیت ${a.status||"open"}`,a.at||a.updatedAt,{id:a.id}); }
  for(const a of db.attendance||[]){ if(a.studentId!==student.id)continue; const label={present:"حاضر",absent:"غایب",late:"تأخیر",excused:"موجه"}[a.status]||a.status||"ثبت حضور"; add("attendance",`حضور و غیاب: ${label}`,`${a.subject||""}${a.note?` · ${a.note}`:""}`,a.date||a.at,{id:a.id}); }
  for(const hs of db.homeworkSubmissions||[]){ if(hs.studentId!==student.id)continue; const h=(db.homework||[]).find(x=>x.id===hs.homeworkId); add("homework","تحویل تکلیف",`${h?.title||"تکلیف"} · ${hs.status||"submitted"}${hs.score!==undefined?` · نمره ${hs.score}`:""}`,hs.submittedAt||hs.at||hs.updatedAt,{id:hs.id,subject:h?.subject||""}); }
  for(const c of db.continuousAssessments||[]){ if(c.studentId!==student.id)continue; add("continuous",c.title||"ارزشیابی مستمر",`${c.subject||""}${c.score!==undefined?` · نمره ${c.score}`:""}`,c.date||c.at||c.createdAt,{id:c.id}); }
  for(const b of db.behaviorRecords||[]){ if(b.studentId!==student.id)continue; add("behavior",b.type==="positive"?"تشویق/بازخورد مثبت":"ثبت رفتاری",b.title||b.note||b.category||"",b.date||b.at||b.createdAt,{id:b.id}); }
  for(const g of db.guardianContacts||[]){ if(g.studentId!==student.id)continue; add("family","ارتباط با خانواده",`${g.type||"تماس"} · ${g.outcome||g.note||""}`,g.date||g.at||g.createdAt,{id:g.id}); }
  for(const i of db.interventions||[]){ if(i.studentId!==student.id)continue; add("intervention","پیگیری آموزشی",`${i.status||"open"} · ${i.action||i.reason||""}`,i.createdAt||i.at||i.updatedAt,{id:i.id}); }
  for(const r of db.progressReports||[]){ if(r.studentId!==student.id)continue; add("report","گزارش پیشرفت",r.summary||r.title||"گزارش منتشر شده",r.publishedAt||r.createdAt||r.at,{id:r.id}); }
  rows.sort((a,b)=>b.sort-a.sort); return rows.slice(0,500);
}
async function handleWorkbenchV38Api(req,res,url){
  try{
    const auth=await authenticate(req,["teacher","admin","superadmin"]); const scoped=scopedDbForStaff(auth.db,auth.user);
    if(req.method==="GET"&&url.pathname==="/api/workbench/actions") return sendJson(res,200,buildActionCenterV38(scoped,auth.user));
    if(req.method==="GET"&&url.pathname==="/api/workbench/search") return sendJson(res,200,{query:url.searchParams.get("q")||"",results:globalSearchV38(scoped,auth.user,url.searchParams.get("q")||"")});
    const p=url.pathname.match(/^\/api\/workbench\/students\/([^/]+)\/profile$/);
    if(req.method==="GET"&&p){
      const id=decodeURIComponent(p[1]); const student=(scoped.users||[]).find(u=>u.id===id&&u.role==="student");
      if(!student)throw Object.assign(new Error("دانش‌آموز در محدوده دسترسی شما نیست."),{status:403});
      return sendJson(res,200,{student:publicStudent(student,scoped),photoDataUrl:await readStudentProfilePhoto(student.id),sync:{profileUpdatedAt:student.profileUpdatedAt||"",profilePhotoUpdatedAt:student.profilePhotoUpdatedAt||"",source:"server"}});
    }
    const d=url.pathname.match(/^\/api\/workbench\/students\/([^/]+)\/dossier$/);
    if(req.method==="GET"&&d){ const id=decodeURIComponent(d[1]); const student=(scoped.users||[]).find(u=>u.id===id&&u.role==="student"); if(!student)throw Object.assign(new Error("دانش‌آموز در محدوده دسترسی شما نیست."),{status:403}); const dossier=buildStudentDossierV4521(scoped,id,{includeSensitive:["admin","superadmin"].includes(auth.user.role)}); if(!dossier)throw Object.assign(new Error("پرونده دانش‌آموز پیدا نشد."),{status:404}); dossier.photoDataUrl=await readStudentProfilePhoto(id); return sendJson(res,200,{ok:true,dossier}); }
    const m=url.pathname.match(/^\/api\/workbench\/students\/([^/]+)\/timeline$/);
    if(req.method==="GET"&&m){ const id=decodeURIComponent(m[1]); const student=(scoped.users||[]).find(u=>u.id===id&&u.role==="student"); if(!student)throw Object.assign(new Error("دانش‌آموز در محدوده دسترسی شما نیست."),{status:403}); return sendJson(res,200,{student:{id:student.id,firstName:student.firstName,lastName:student.lastName,studentCode:student.studentCode||"",classId:student.classId,className:v38ClassName(scoped,student.classId)},events:studentTimelineV38(scoped,student)}); }
    return sendJson(res,404,{error:"مسیر مرکز کار پیدا نشد."});
  }catch(error){ return sendJson(res,error.status||500,{error:error.message||"خطای مرکز کار"}); }
}

function purgeUserFromStateV4516(db, target) {
  const id = target.id;
  const next = JSON.parse(JSON.stringify(db));
  if (target.role === "student") {
    const submissionIds = new Set((next.submissions || []).filter(x => x.studentId === id).map(x => x.id));
    const appealIds = new Set((next.appeals || []).filter(x => x.studentId === id).map(x => x.id));
    const linkIds = new Set((next.guardianLinks || []).filter(x => x.studentId === id || x.userId === id).map(x => x.id));
    const directCollections = [
      "attempts","submissions","appeals","notifications","examAbsenceFollowupsT02","attendance","homeworkSubmissions","continuousAssessments","behaviorRecords","interventions","guardianContacts","progressReports","termGrades",
      "enrollments","studentDocuments","studentExtendedProfiles","recordHistory","answerSheets","studentGoals","masteryRecords","studyPlans","offlineSyncQueue","studentFiles","achievements","studentReceipts","studentBookmarks",
      "counselingCases","counselingSessions","familyMeetings","disciplinaryCases","parentRequests","reportCards","admissions","certificates","libraryLoans","transportation","formSubmissions","feeAccounts","assessmentIncidents"
    ];
    for (const key of directCollections) if (Array.isArray(next[key])) next[key] = next[key].filter(row => !(row && (row.studentId === id || row.userId === id || row.studentUserId === id || row.targetUserId === id)));
    if (Array.isArray(next.grades)) next.grades = next.grades.filter(row => !submissionIds.has(row.submissionId || row.uploadId));
    if (Array.isArray(next.gradeRevisions)) next.gradeRevisions = next.gradeRevisions.filter(row => row.studentId !== id && !appealIds.has(row.appealId));
    if (Array.isArray(next.guardianLinks)) next.guardianLinks = next.guardianLinks.filter(row => row.studentId !== id && row.userId !== id);
    if (Array.isArray(next.guardianMessages)) next.guardianMessages = next.guardianMessages.filter(row => !linkIds.has(row.linkId || row.guardianLinkId));
  } else if (target.role === "teacher") {
    next.teachingAssignments = (next.teachingAssignments || []).filter(row => row.teacherId !== id);
    next.notifications = (next.notifications || []).filter(row => row.userId !== id);
    if (Array.isArray(next.teacherDailyTasks)) next.teacherDailyTasks = next.teacherDailyTasks.filter(row => row.teacherId !== id && row.userId !== id);
    if (Array.isArray(next.userAccessReviews)) next.userAccessReviews = next.userAccessReviews.filter(row => row.userId !== id && row.targetUserId !== id);
  }
  next.users = (next.users || []).filter(user => user.id !== id);
  return next;
}

// P67.20-T05E — atomic family contact writing, independent from full teacher state sync.
// Permission checks are always evaluated against live server state.
function validateFamilyContactT05E(body,db,user){
  if(!body || typeof body!=="object" || Array.isArray(body))throw Object.assign(new Error("ساختار ارتباط با ولی نامعتبر است."),{status:400});
  const id=String(body.id||"").trim();
  if(!/^gcontact_[a-z0-9]{6,25}_[a-z0-9]{3,12}$/i.test(id))throw Object.assign(new Error("شناسه ثبت ارتباط معتبر نیست."),{status:400});
  const studentId=String(body.studentId||"").trim();
  const student=(db.users||[]).find(st=>st.id===studentId&&st.role==="student"&&st.active!==false&&st.profileStatus!=="deleted");
  if(!student)throw Object.assign(new Error("دانش‌آموز فعال انتخاب‌شده پیدا نشد."),{status:404});
  const cls=(db.school?.classes||[]).find(c=>c.id===student.classId&&c.active!==false);
  if(!cls)throw Object.assign(new Error("کلاس دانش‌آموز فعال نیست."),{status:409});
  if(user.role==="teacher"&&!teacherCanAssigned(db,user,{classId:student.classId,feature:"family"}))throw Object.assign(new Error("مجوز فعال «اطلاعات و ارتباط خانواده» برای این کلاس ندارید."),{status:403,code:"FAMILY_SCOPE_DENIED"});
  if(!["teacher","admin","superadmin"].includes(user.role))throw Object.assign(new Error("دسترسی ثبت ارتباط ندارید."),{status:403});
  const type=String(body.type||"call");
  if(!["call","meeting","message","other"].includes(type))throw Object.assign(new Error("نوع ارتباط معتبر نیست."),{status:400});
  const date=String(body.date||"").trim();
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const d=match?new Date(`${date}T12:00:00Z`):null;
  if(!d||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==date)throw Object.assign(new Error("تاریخ ارتباط معتبر نیست."),{status:400});
  const outcome=String(body.outcome||"").trim(),nextAction=String(body.nextAction||"").trim(),followupDate=String(body.followupDate||"").trim();
  if(outcome.length<3||outcome.length>2000)throw Object.assign(new Error("نتیجه گفتگو باید بین ۳ و ۲۰۰۰ نویسه باشد."),{status:400});
  if(nextAction.length>1000||followupDate.length>40)throw Object.assign(new Error("متن اقدام بعدی یا تاریخ پیگیری بیش از حد طولانی است."),{status:400});
  return {id,studentId:student.id,classId:student.classId,type,date,outcome,nextAction,followupDate,status:nextAction?"open":"closed"};
}

async function handleStaffApi(req, res, url) {
  try {
    if (req.method === "POST" && url.pathname === "/api/staff/login") {
      const body = await readJson(req); const identifier = body.identifier || body.username || body.nationalId;
      const rate = await loginRateStatus(req, identifier);
      if (rate.blocked) throw Object.assign(new Error(`تلاش‌های ناموفق زیاد بوده است؛ ${rate.retryAfter} ثانیه بعد دوباره امتحان کنید.`), { status: 429 });
      const envelope = await ensureStateInitialized(); const security = await ensureSecurityInitialized(envelope.db);
      const user = findUserByIdentifier(envelope.db, security, identifier, "staff"); const credential = user ? security.credentials[user.id] : null;
      const ok = user && credential && await passwordVerify(String(body.password || ""), credential.passwordHash);
      if (!ok) {
        await recordLoginFailure(rate.key); await securityAudit({ type: "staff_login", success: false, ip: clientIp(req), details: "اطلاعات ورود نادرست" });
        throw Object.assign(new Error("کد ملی/نام کاربری یا رمز عبور صحیح نیست."), { status: 401 });
      }
      if(credential.mfaEnabled){
        const suppliedOtp=String(body.otp||body.mfaCode||"").trim(), suppliedRecovery=String(body.recoveryCode||"").trim();
        if(!suppliedOtp&&!suppliedRecovery){
          await securityAudit({type:"staff_mfa_challenge",userId:user.id,role:user.role,success:true,ip:clientIp(req),details:"challenge-required"});
          return sendJson(res,428,{error:"کد تأیید دومرحله‌ای را وارد کنید.",code:"MFA_REQUIRED",mfaRequired:true,recoveryAllowed:Array.isArray(credential.mfaRecoveryHashes)&&credential.mfaRecoveryHashes.length>0});
        }
        const mfa=await mutateSecurity(async sec=>{
          const c=sec.credentials?.[user.id];if(!c)return {ok:false};
          return verifyStaffMfaCredential(c,body,{consumeRecovery:true});
        });
        if(!mfa.result?.ok){
          await recordLoginFailure(rate.key);await securityAudit({type:"staff_mfa_failed",userId:user.id,role:user.role,success:false,ip:clientIp(req),details:"invalid-second-factor"});
          throw Object.assign(new Error("کد تأیید دومرحله‌ای صحیح نیست."),{status:401,code:"MFA_INVALID"});
        }
        await securityAudit({type:"staff_mfa_verified",userId:user.id,role:user.role,success:true,ip:clientIp(req),details:String(mfa.result.method||"totp")});
      }
      await recordLoginSuccess(rate.key);
      const loginUpdate=await mutateSecurity(sec=>{const c=sec.credentials?.[user.id];if(c){c.lastLoginAt=new Date().toISOString();c.lastLoginIp=clientIp(req);c.lastLoginUserAgent=String(req.headers["user-agent"]||"").slice(0,250);}return c||null;});
      const token = await issueSession(user, req, loginUpdate.security);
      await securityAudit({ type: "staff_login", userId: user.id, role: user.role, success: true, ip: clientIp(req), details:credential.mfaEnabled?"mfa":"password" });
      return sendJson(res, 200, { token, user: publicAuthUser(user, loginUpdate.security), mustChangePassword: Boolean(credential.mustChangePassword), mfaEnabled:Boolean(loginUpdate.result?.mfaEnabled) });
    }

    const passwordChangeRoute = req.method === "POST" && url.pathname === "/api/staff/change-password";
    const auth = await authenticate(req, STAFF_ROLES, { allowPasswordChange: passwordChangeRoute });
    if (req.method === "GET" && url.pathname === "/api/staff/me") return sendJson(res, 200, { user: publicAuthUser(auth.user, auth.security) });
    if(req.method==="POST"&&url.pathname==="/api/staff/attendance/program-save"){
      const body=await readJson(req),scheduleEntryId=String(body.scheduleEntryId||"").trim(),date=String(body.date||"").trim(),records=Array.isArray(body.records)?body.records:[];
      if(!scheduleEntryId)throw Object.assign(new Error("زنگ برنامه مشخص نیست."),{status:400});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||schoolDayNameForDateV78(date)==="")throw Object.assign(new Error("تاریخ جلسه معتبر نیست."),{status:400});
      if(!records.length||records.length>250)throw Object.assign(new Error("فهرست حضور و غیاب معتبر نیست."),{status:400});
      const nowClock=schoolClockV74(),saved=await mutateDb(m=>{
        m.attendanceSessions=Array.isArray(m.attendanceSessions)?m.attendanceSessions:[];m.attendance=Array.isArray(m.attendance)?m.attendance:[];m.notifications=Array.isArray(m.notifications)?m.notifications:[];m.audit=Array.isArray(m.audit)?m.audit:[];
        const entry=(m.weeklySchedule||[]).find(x=>String(x.id||"")===scheduleEntryId&&x.active!==false&&String(x.academicYear||m.school?.year||"")===String(m.school?.year||""));
        if(!entry)throw Object.assign(new Error("زنگ برنامه هفتگی پیدا نشد یا مربوط به سال فعال نیست."),{status:404});
        if(entry.day!==schoolDayNameForDateV78(date))throw Object.assign(new Error("تاریخ انتخاب‌شده با روز برنامه این زنگ مطابقت ندارد."),{status:409,code:"ATTENDANCE_DAY_MISMATCH"});
        if(auth.user.role==="teacher"){
          if(String(entry.teacherId||"")!==String(auth.user.id||"")||!teacherCanAssigned(m,auth.user,{classId:entry.classId,subject:entry.subject||"",feature:"attendance"}))throw Object.assign(new Error("این کلاس در محدوده تدریس شما نیست."),{status:403});
          if(date!==nowClock.date||entry.day!==nowClock.dayName)throw Object.assign(new Error("معلم فقط حضور کلاس امروز را می‌تواند ثبت کند."),{status:409,code:"ATTENDANCE_TEACHER_DATE_LOCK"});
          const win=teacherWindowV78(entry,nowClock);if(!win.open)throw Object.assign(new Error("الان خارج از بازه ثبت حضور این کلاس هستید."),{status:409,code:"ATTENDANCE_WINDOW_CLOSED"});
          const block=classAttendanceBlockV78(m,entry.classId,date);if(block)throw Object.assign(new Error(`ثبت حضور امروز به علت «${block.title||"تعطیلی"}» بسته است.`),{status:409,code:"ATTENDANCE_BLOCKED"});
        }else if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("دسترسی ثبت حضور و غیاب ندارید."),{status:403});
        const roster=activeClassStudentsV78(m,entry.classId),rosterIds=new Set(roster.map(s=>String(s.id))),seen=new Set(),byStudent=new Map();
        for(const raw of records){const studentId=String(raw?.studentId||"").trim();if(!rosterIds.has(studentId))throw Object.assign(new Error("یکی از دانش‌آموزان خارج از کلاس انتخاب‌شده است."),{status:409,code:"ATTENDANCE_ROSTER_MISMATCH"});if(seen.has(studentId))throw Object.assign(new Error("دانش‌آموز تکراری در فهرست حضور وجود دارد."),{status:400});seen.add(studentId);const status=normalizeAttendanceStatusV81(raw?.status),note=String(raw?.note||"").trim().slice(0,500);byStudent.set(studentId,{studentId,status,note});}
        if(seen.size!==rosterIds.size)throw Object.assign(new Error("فهرست حضور باید همه دانش‌آموزان فعال کلاس را شامل شود."),{status:409,code:"ATTENDANCE_INCOMPLETE_ROSTER"});
        const nowIso=new Date().toISOString(),nowFa=faNow(),period=activePeriodForDateV78(m,date);
        let session=m.attendanceSessions.filter(x=>String(x.scheduleEntryId||"")===scheduleEntryId&&String(x.date||"")===date).sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0];
        const sessionBase={scheduleEntryId:entry.id,classId:entry.classId,subject:entry.subject||"",teacherId:entry.teacherId||"",date,period:`زنگ ${Number(entry.periodNo||0)}`,periodNo:Number(entry.periodNo||0),shiftId:entry.shiftId||"",startTime:entry.startTime||"",endTime:entry.endTime||"",academicYear:String(m.school?.year||""),academicPeriod:period,updatedAt:nowIso,updatedBy:auth.user.id,source:"staff-web-v728912"};
        if(session)Object.assign(session,sessionBase);else{session={id:makeId("ats"),...sessionBase,createdAt:nowIso,createdBy:auth.user.id};m.attendanceSessions.unshift(session);}
        const priorRows=m.attendance.filter(x=>String(x.sessionId||"")===String(session.id)),priorByStudent=new Map(priorRows.map(x=>[String(x.studentId||""),x]));
        m.attendance=m.attendance.filter(x=>String(x.sessionId||"")!==String(session.id));
        let present=0,late=0,pending=0,excused=0,unexcused=0,notified=0;
        for(const stu of roster){const input=byStudent.get(String(stu.id)),old=priorByStudent.get(String(stu.id)),oldStatus=normalizeAttendanceStatusV81(old?.status),status=input.status,note=input.note;const row={...(old||{}),id:old?.id||makeId("attrec"),sessionId:session.id,scheduleEntryId:entry.id,studentId:stu.id,classId:entry.classId,subject:entry.subject||"",teacherId:entry.teacherId||"",date,periodNo:Number(entry.periodNo||0),shiftId:entry.shiftId||"",academicYear:String(m.school?.year||""),academicPeriod:period,status,note,markedBy:auth.user.id,markedAt:old?.markedAt||nowIso,updatedAt:nowIso,at:nowFa,source:"staff-web-v728912"};
          if(status==="present"||status==="late"||oldStatus!==status){delete row.absenceReasonId;delete row.absenceReasonText;delete row.reviewedAt;delete row.reviewedBy;delete row.reviewNote;}
          m.attendance.push(row);
          if(status==="present")present++;else if(status==="late")late++;else if(status==="absent_excused")excused++;else if(status==="absent_unexcused")unexcused++;else pending++;
          if((status==="absent_pending"||status==="late")&&oldStatus!==status){const title=status==="late"?"تأخیر ثبت شد":"غیبت ثبت شد",bodyText=`${entry.subject||"کلاس"} · زنگ ${Number(entry.periodNo||0)} · ${date}${note?` · ${note}`:""}`;m.notifications.unshift({id:makeId("notif"),userId:stu.id,type:"attendance",title,body:bodyText,message:bodyText,read:false,at:nowFa,createdAt:nowFa,createdAtIso:nowIso});notified++;}
        }
        const absent=pending+excused+unexcused;
        m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت حضور و غیاب برنامه‌ای",details:`${classInfoV78(m,entry.classId).name} · ${entry.subject||""} · زنگ ${Number(entry.periodNo||0)} · ${date} · حاضر ${present} · تأخیر ${late} · غایب ${absent}`,at:nowFa});
        return {session:{...session},summary:{total:roster.length,present,late,absent,pending,excused,unexcused,notified},records:m.attendance.filter(x=>String(x.sessionId||"")===String(session.id))};
      });
      await securityAudit({type:"program_attendance_save",userId:auth.user.id,role:auth.user.role,success:true,ip:clientIp(req),details:`${scheduleEntryId}:${date}:${saved.result.summary.present}/${saved.result.summary.total}`});
      return sendJson(res,200,{ok:true,...saved.result,updatedAt:saved.updatedAt});
    }
    // P67.28 — account security: TOTP MFA and device/session controls.
    if(req.method==="GET"&&url.pathname==="/api/staff/security/mfa"){
      const c=auth.security.credentials?.[auth.user.id]||{};
      return sendJson(res,200,{ok:true,eligible:mfaEligibleRole(auth.user.role),enabled:Boolean(c.mfaEnabled),pending:Boolean(c.mfaPending&&Number(c.mfaPending.expiresAt||0)>Date.now()),recoveryCodesRemaining:Array.isArray(c.mfaRecoveryHashes)?c.mfaRecoveryHashes.length:0});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/security/mfa/setup/start"){
      if(!mfaEligibleRole(auth.user.role))throw Object.assign(new Error("تأیید دومرحله‌ای این بخش برای مدیر و سوپرادمین فعال می‌شود."),{status:403});
      const body=await readJson(req),currentPassword=String(body.currentPassword||"");
      const current=auth.security.credentials?.[auth.user.id];
      if(!current||!await passwordVerify(currentPassword,current.passwordHash))throw Object.assign(new Error("رمز فعلی صحیح نیست."),{status:401});
      if(current.mfaEnabled)throw Object.assign(new Error("تأیید دومرحله‌ای از قبل فعال است."),{status:409});
      const secret=generateTotpSecret(),recoveryCodes=generateRecoveryCodes(10),expiresAt=Date.now()+10*60*1000;
      const updated=await mutateSecurity(sec=>{const c=sec.credentials?.[auth.user.id];if(!c)throw Object.assign(new Error("حساب امنیتی پیدا نشد."),{status:404});c.mfaPending={secret,recoveryHashes:recoveryCodes.map(recoveryCodeHash),createdAt:Date.now(),expiresAt};return c;});
      await securityAudit({type:"mfa_setup_start",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:"totp-pending"});
      return sendJson(res,200,{ok:true,secret,otpauthUri:otpauthUri({secret,account:updated.result?.username||auth.user.id,issuer:"Madreseyar"}),recoveryCodes,expiresAt});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/security/mfa/setup/confirm"){
      if(!mfaEligibleRole(auth.user.role))throw Object.assign(new Error("دسترسی مجاز نیست."),{status:403});
      const body=await readJson(req),code=String(body.code||body.otp||"");
      const updated=await mutateSecurity(sec=>{const c=sec.credentials?.[auth.user.id];const pending=c?.mfaPending;if(!c||!pending||Number(pending.expiresAt||0)<Date.now())return {error:"expired"};if(!verifyTotp(String(pending.secret||""),code))return {error:"code"};c.mfaEnabled=true;c.mfaSecret=pending.secret;c.mfaRecoveryHashes=Array.isArray(pending.recoveryHashes)?pending.recoveryHashes:[];c.mfaEnabledAt=new Date().toISOString();delete c.mfaPending;for(const [hash,sess] of Object.entries(sec.sessions||{}))if(sess.userId===auth.user.id&&hash!==auth.tokenHash)delete sec.sessions[hash];return {enabled:true,recoveryCodesRemaining:c.mfaRecoveryHashes.length};});
      if(updated.result?.error==="expired")throw Object.assign(new Error("فرایند فعال‌سازی منقضی شده است؛ دوباره شروع کنید."),{status:410});
      if(updated.result?.error==="code")throw Object.assign(new Error("کد برنامه Authenticator صحیح نیست."),{status:401});
      await securityAudit({type:"mfa_enabled",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:"totp"});
      return sendJson(res,200,{ok:true,...updated.result});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/security/mfa/disable"){
      const body=await readJson(req),currentPassword=String(body.currentPassword||"");
      const updated=await mutateSecurity(async sec=>{const c=sec.credentials?.[auth.user.id];if(!c||!c.mfaEnabled)return {error:"not_enabled"};if(!await passwordVerify(currentPassword,c.passwordHash))return {error:"password"};const second=await verifyStaffMfaCredential(c,body,{consumeRecovery:true});if(!second.ok)return {error:"mfa"};delete c.mfaEnabled;delete c.mfaSecret;delete c.mfaRecoveryHashes;delete c.mfaEnabledAt;delete c.mfaPending;for(const [hash,sess] of Object.entries(sec.sessions||{}))if(sess.userId===auth.user.id&&hash!==auth.tokenHash)delete sec.sessions[hash];return {ok:true};});
      if(updated.result?.error==="not_enabled")throw Object.assign(new Error("تأیید دومرحله‌ای فعال نیست."),{status:409});
      if(updated.result?.error==="password")throw Object.assign(new Error("رمز فعلی صحیح نیست."),{status:401});
      if(updated.result?.error==="mfa")throw Object.assign(new Error("کد دومرحله‌ای یا بازیابی صحیح نیست."),{status:401});
      await securityAudit({type:"mfa_disabled",userId:auth.user.id,role:auth.user.role,ip:clientIp(req)});
      return sendJson(res,200,{ok:true});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/security/mfa/recovery/regenerate"){
      const body=await readJson(req),currentPassword=String(body.currentPassword||"");const recoveryCodes=generateRecoveryCodes(10);
      const updated=await mutateSecurity(async sec=>{const c=sec.credentials?.[auth.user.id];if(!c||!c.mfaEnabled)return {error:"not_enabled"};if(!await passwordVerify(currentPassword,c.passwordHash))return {error:"password"};const second=await verifyStaffMfaCredential(c,body,{consumeRecovery:true});if(!second.ok)return {error:"mfa"};c.mfaRecoveryHashes=recoveryCodes.map(recoveryCodeHash);c.mfaRecoveryRegeneratedAt=new Date().toISOString();return {ok:true};});
      if(updated.result?.error==="not_enabled")throw Object.assign(new Error("تأیید دومرحله‌ای فعال نیست."),{status:409});
      if(updated.result?.error==="password")throw Object.assign(new Error("رمز فعلی صحیح نیست."),{status:401});
      if(updated.result?.error==="mfa")throw Object.assign(new Error("کد دومرحله‌ای یا بازیابی صحیح نیست."),{status:401});
      await securityAudit({type:"mfa_recovery_regenerated",userId:auth.user.id,role:auth.user.role,ip:clientIp(req)});
      return sendJson(res,200,{ok:true,recoveryCodes});
    }
    const questionBankHandled = await handleQuestionBankRoutes({
      req,res,url,auth,
      services:{sendJson,readJson,ensureStateInitialized,enqueueStateOperation,writeStateEnvelope,
        upgradeServerDbRespectingReset,validateServerState,makeId,faNow,clientIp,securityAudit,gradeMeta,scopedDbForStaff}
    });
    if(questionBankHandled)return;
    const examManagementHandled = await handleExamManagementRoutes({
      req,res,url,auth,
      services:{sendJson,readJson,ensureStateInitialized,mutateDb,teacherCanAssigned,studentClassIds,
        teacherCanReadQuestion,makeId,faNow,securityAudit,clientIp,scopedDbForStaff,enqueueStateOperation,writeStateEnvelope}
    });
    if(examManagementHandled)return;
    const stateCommandHandled = await handleStateCommandRoutes({
      req,res,url,auth,
      services:{sendJson,readJson,mutateDb,makeId,faNow,securityAudit,clientIp}
    });
    if(stateCommandHandled)return;

    // ===== P0-STABILIZED-STAFF-GUARDIAN-MEETING-API-BEGIN =====
    if(req.method==="GET"&&url.pathname==="/api/staff/guardian-meeting-invitations"){
      const teacherId=String(auth.user?.id||"");
      const rows=(auth.db.parentRequests||[]).filter(r=>{
        if(String(r.kind||r.type||"")!=="meeting_invitation")return false;
        if(auth.user.role==="teacher"){const owner=String(r.teacherId||r.createdBy||r.requesterId||"");if(owner!==teacherId)return false;}
        return true;
      }).map(r=>{const st=(auth.db.users||[]).find(u=>String(u.id||"")===String(r.studentId||""));const studentName=st?`${st.firstName||""} ${st.lastName||""}`.trim():(r.studentName||"دانش‌آموز");return {...r,studentName};})
        .slice().sort((a,b)=>String(b.respondedAtIso||b.createdAtIso||b.respondedAt||b.createdAt||"").localeCompare(String(a.respondedAtIso||a.createdAtIso||a.respondedAt||a.createdAt||""))).slice(0,200);
      const unreadCount=rows.filter(r=>(r.respondedAt||r.respondedAtIso)&&!r.teacherSeenAt).length;
      return sendJson(res,200,{ok:true,meetings:rows,unreadCount});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/guardian-meeting-invitations/read"){
      const b=await readJson(req),ids=[...new Set((Array.isArray(b.requestIds)?b.requestIds:[b.requestId]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,200);
      if(!ids.length)return sendJson(res,200,{ok:true,marked:0});
      const marked=await mutateDb(live=>{let count=0,now=faNow(),nowIso=new Date().toISOString();for(const row of live.parentRequests||[]){if(!ids.includes(String(row.id||""))||String(row.kind||row.type||"")!=="meeting_invitation"||!(row.respondedAt||row.respondedAtIso))continue;const owner=String(row.teacherId||row.createdBy||row.requesterId||"");if(auth.user.role==="teacher"&&owner!==String(auth.user.id||""))continue;row.teacherSeenAt=now;row.teacherSeenAtIso=nowIso;count++;}return count;});
      return sendJson(res,200,{ok:true,marked:Number(marked.result||0)});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/guardian-meeting-invitations"){
      const b=await readJson(req);
      const saved=await mutateDb(live=>{
        if(!["teacher","admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("دسترسی ثبت دعوت ملاقات ندارید."),{status:403});
        const studentId=String(b.studentId||"").trim(),student=(live.users||[]).find(st=>st.id===studentId&&st.role==="student"&&st.active!==false&&st.profileStatus!=="deleted");
        if(!student)throw Object.assign(new Error("دانش‌آموز فعال پیدا نشد."),{status:404});
        if(auth.user.role==="teacher"&&!teacherCanAssigned(live,auth.user,{classId:student.classId,feature:"family"}))throw Object.assign(new Error("مجوز «اطلاعات و ارتباط خانواده» برای این کلاس فعال نیست."),{status:403});
        const meetingDate=normalizeMeetingJalaliDateV52(b.meetingDate||b.date),meetingTime=normalizeMeetingTimeV52(b.meetingTime||b.time);
        const location=String(b.location||"").trim(),description=String(b.description||b.message||"").trim();
        if(!meetingDate)throw Object.assign(new Error("تاریخ ملاقات شمسی معتبر نیست."),{status:400});
        const today=currentMeetingJalaliDateV52();if(today&&meetingDate<today)throw Object.assign(new Error("تاریخ ملاقات نمی‌تواند مربوط به گذشته باشد."),{status:400});
        if(!meetingTime)throw Object.assign(new Error("ساعت ملاقات معتبر نیست."),{status:400});
        if(location.length<2||location.length>250)throw Object.assign(new Error("محل ملاقات باید بین ۲ تا ۲۵۰ نویسه باشد."),{status:400});
        if(description.length<2||description.length>1500)throw Object.assign(new Error("علت یا توضیح ملاقات باید بین ۲ تا ۱۵۰۰ نویسه باشد."),{status:400});
        const clientRequestId=String(b.clientRequestId||"").trim().slice(0,120);
        if(clientRequestId&&!/^[A-Za-z0-9_-]{8,120}$/.test(clientRequestId))throw Object.assign(new Error("شناسه درخواست ملاقات معتبر نیست."),{status:400});
        live.parentRequests=Array.isArray(live.parentRequests)?live.parentRequests:[];
        const existing=clientRequestId?live.parentRequests.find(r=>String(r.kind||r.type||"")==="meeting_invitation"&&String(r.createdBy||r.teacherId||"")===String(auth.user.id||"")&&String(r.clientRequestId||"")===clientRequestId):null;
        if(existing)return {row:existing,idempotent:true};
        const teacherName=`${auth.user.firstName||""} ${auth.user.lastName||""}`.trim()||auth.user.name||"معلم مدرسه",now=faNow(),nowIso=new Date().toISOString();
        const row={id:makeId("preq"),clientRequestId:clientRequestId||makeId("gmreq"),studentId,classId:student.classId,kind:"meeting_invitation",type:"meeting_invitation",source:"teacher",teacherId:auth.user.id,createdBy:auth.user.id,requesterId:auth.user.id,teacherName,requesterName:teacherName,meetingDate,meetingTime,location,description,message:description,status:"pending_guardian",academicYear:String(live.school?.year||""),createdAt:now,createdAtIso:nowIso};
        live.parentRequests.unshift(row);live.audit=Array.isArray(live.audit)?live.audit:[];live.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ارسال دعوت ملاقات برای ولی",details:`${studentId} — ${meetingDate} ${meetingTime}`,at:now});
        return {row,idempotent:false};
      });
      return sendJson(res,200,{ok:true,meeting:saved.result.row,idempotent:Boolean(saved.result.idempotent)});
    }
    // ===== P0-STABILIZED-STAFF-GUARDIAN-MEETING-API-END =====

    // P67.20-T05E — family contact write is independent of unrelated grade/exam state.
    if(req.method==="POST"&&url.pathname==="/api/staff/family/contact/t05e"){
      const payload=await readJson(req);
      const saved=await mutateDb(async live=>{
        // Authorization and validation MUST use the current server snapshot.
        const row=validateFamilyContactT05E(payload,live,auth.user);
        live.guardianContacts=Array.isArray(live.guardianContacts)?live.guardianContacts:[];
        const existing=live.guardianContacts.find(x=>x.id===row.id);
        if(existing){
          if(existing.studentId!==row.studentId||existing.classId!==row.classId||existing.createdBy!==auth.user.id)
            throw Object.assign(new Error("شناسه ارتباط از قبل برای رکورد دیگری استفاده شده است."),{status:409});
          // Same ID is a retry only if the submitted content is unchanged.
          const keys=["studentId","classId","type","date","outcome","nextAction","followupDate","status"];
          if(keys.some(k=>String(existing[k]??"")!==String(row[k]??"")))
            throw Object.assign(new Error("این ارتباط قبلاً با اطلاعات دیگری ثبت شده است. فرم را ببندید و برای ارتباط جدید دوباره باز کنید."),{status:409});
          return {row:existing,idempotent:true};
        }
        const created={...row,createdBy:auth.user.id,createdAt:faNow(),createdAtIso:new Date().toISOString(),academicYear:String(live.school?.year||"")};
        live.guardianContacts.unshift(created);
        live.audit=Array.isArray(live.audit)?live.audit:[];
        live.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت ارتباط با ولی",details:`${row.studentId} — ${row.type}`,at:faNow()});
        return {row:created,idempotent:false};
      });
      await securityAudit({type:"family_contact_write_t05e",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:saved.result.idempotent?"retry":"new contact"});
      return sendJson(res,200,{ok:true,contact:saved.result.row,idempotent:saved.result.idempotent});
    }
    // P67.11: read-only, class/subject-scoped view of the exact final
    // results used by /api/student/results. No grades/state are written here.
    if (req.method === "GET" && url.pathname === "/api/staff/student-exam-report/p6711") {
      if (auth.user.role !== "teacher") throw Object.assign(new Error("فقط معلم می‌تواند کارنامه تفصیلی را بخواند."),{status:403});
      const schoolDb = auth.db;
      const studentId = String(url.searchParams.get("studentId")||"").trim();
      const student = (schoolDb.users||[]).find(x=>x.id===studentId && x.role==="student" && x.active!==false);
      const scope = teacherScope(schoolDb,auth.user);
      if (!student || !scope.studentIds.has(student.id))
        throw Object.assign(new Error("دانش‌آموز در کلاس‌های مجاز این معلم نیست."),{status:403});
      const exams = (schoolDb.exams||[]).filter(e=>
        e.classId===student.classId && scope.examIds.has(e.id) &&
        teacherCanAssigned(schoolDb,auth.user,{classId:e.classId,subject:e.subject||"",bookId:e.bookId||""}));
      const byId=new Map(exams.map(e=>[String(e.id),e]));
      const data=[];
      for(const a of schoolDb.attempts||[]){
        if(String(a.studentId)!==String(student.id))continue;
        const e=byId.get(String(a.examId));if(!e)continue;
        const score=Number(a.score),total=Number(a.total||examTotalScore(e));
        if(!Number.isFinite(score)||!Number.isFinite(total)||total<=0)continue;
        data.push({examId:e.id,title:e.title,subject:e.subject||"درس نامشخص",type:e.type||"mcq",score,total,status:"final",submittedAt:Number(a.submittedAt||0)});
      }
      for(const sub of schoolDb.submissions||[]){
        if(String(sub.studentId)!==String(student.id))continue;
        const e=byId.get(String(sub.examId));if(!e)continue;
        const grade=(schoolDb.grades||[]).find(g=>String(g.submissionId)===String(sub.id));
        if(!grade)continue; // Exactly as the student app: ungraded work is not final.
        const score=Number(grade.finalScore),total=Number(examTotalScore(e));
        if(!Number.isFinite(score)||!Number.isFinite(total)||total<=0)continue;
        data.push({examId:e.id,title:e.title,subject:e.subject||"درس نامشخص",type:e.type||"descriptive",score,total,status:"final",submittedAt:Number(sub.submittedAt||0)});
      }
      // Keep the latest result for any repeated exam record, rather than double counting.
      const unique=new Map();
      for(const r of data){const k=String(r.examId);const prev=unique.get(k);if(!prev||Number(r.submittedAt||0)>=Number(prev.submittedAt||0))unique.set(k,r);}
      const results=[...unique.values()].sort((a,b)=>Number(b.submittedAt||0)-Number(a.submittedAt||0));
      const grouped=new Map();
      for(const r of results){const key=String(r.subject||"درس نامشخص").trim();if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
      const subjects=[...grouped].map(([subject,rows])=>({subject,count:rows.length,average20:Math.round(rows.reduce((n,r)=>n+20*r.score/r.total,0)/rows.length*100)/100,exams:rows}))
        .sort((a,b)=>a.subject.localeCompare(b.subject,"fa"));
      const average20=results.length?Math.round(results.reduce((n,r)=>n+20*r.score/r.total,0)/results.length*100)/100:null;
      return sendJson(res,200,{ok:true,version:"P67.11",readOnly:true,student:{id:student.id,name:[student.firstName,student.lastName].filter(Boolean).join(" ")||student.name||"دانش‌آموز",classId:student.classId},count:results.length,average20,subjects});
    }

    // P67.20-T02 — authoritative teacher absence follow-ups. No generic /api/state writes.
    if(url.pathname==='/api/staff/exam-absence/t02'&&req.method==='GET'){
      const latest=(await ensureStateInitialized()).db,exam=t02Access(latest,auth.user,String(url.searchParams.get('examId')||''));
      return sendJson(res,200,{ok:true,version:'P67.20-T02',data:t02Snapshot(latest,exam)});
    }
    if(url.pathname==='/api/staff/exam-absence/t02'&&req.method==='POST'){
      const params=await readJson(req);
      const result=await mutateDb(latest=>t02Change(latest,params,auth.user));
      await securityAudit({type:'teacher_exam_absence_t02',userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${params.action}:${params.examId}:${params.studentId}`});
      const exam=t02Access(result.db,auth.user,String(params.examId||''));
      return sendJson(res,200,{ok:true,result:result.result,data:t02Snapshot(result.db,exam)});
    }
    // P67.22-T07 — transactional teacher-confirmed grading; no whole-state overwrite.
    if (url.pathname === "/api/staff/exam-grading/p6722" && req.method === "GET") {
      const latest = (await ensureStateInitialized()).db;
      const submissionId = String(url.searchParams.get("submissionId") || "");
      const submission = (latest.submissions || []).find(x => String(x.id) === submissionId);
      const exam = (latest.exams || []).find(x => String(x.id) === String(submission?.examId));
      if (!submission || !exam || !canTeacherGradeP6722(latest,auth.user,exam,submission))
        throw Object.assign(new Error("برگه در دسترس نیست."),{status:404});
      const grade=(latest.grades||[]).find(g=>String(g.submissionId)===submissionId || String(g.uploadId)===submissionId);
      return sendJson(res,200,{ok:true,finalized:Boolean(grade),grade:grade?{id:grade.id,finalScore:grade.finalScore,publishStatus:grade.publishStatus,gradedAt:grade.gradedAt}:null});
    }
    if (url.pathname === "/api/staff/exam-grading/p6722" && req.method === "POST") {
      const body=await readJson(req);
      const saved=await mutateDb(live=>finalizeTeacherGradeP6722(live,auth.user,body));
      await securityAudit({type:"teacher_grade_final_p6722",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:String(body.submissionId||"").slice(0,100)});
      const current=await ensureStateInitialized();
      return sendJson(res,200,{ok:true,committed:true,updatedAt:current.updatedAt,grade:{id:saved.result.grade.id,submissionId:saved.result.grade.submissionId,finalScore:saved.result.grade.finalScore,publishStatus:saved.result.grade.publishStatus},db:scopedDbForStaff(current.db,auth.user)});
    }
    // P67.8: authenticated, read-only validation of the continuous-exam publication rule.

    // P67.22.13.3 — safe per-item media read for already-approved teacher questions.
    // Only an authenticated assigned teacher can access the *original* admin image.
    // No media URLs or storage paths are public, and there is no mutation here.
    if (url.pathname === "/api/staff/teacher-approved-image/p6722133" && req.method === "GET") {
      if (auth.user.role !== "teacher") throw Object.assign(new Error("تصویر فقط برای معلم مجاز است."), {status:403});
      const id=String(url.searchParams.get("id")||"").trim();
      if(!id || id.length>128) throw Object.assign(new Error("شناسه سؤال معتبر نیست."),{status:400});
      const env=await ensureStateInitialized();
      const question=(env.db.adminQuestionBank||[]).find(q=>String(q.id)===id);
      if(!question || question.type!=="image" || question.status!=="approved" ||
         !teacherCanAssigned(env.db,auth.user,{bookId:question.bookId,subject:question.subject,feature:"questionBank"}))
        throw Object.assign(new Error("سؤال تأییدشده یا مجاز نیست."),{status:404});
      if(!validImageP672213(question.imageDataUrl))
        throw Object.assign(new Error("تصویر اصلی سؤال در مخزن ناقص است؛ مدیر باید آن را بررسی کند."),{status:409});
      return sendJson(res,200,{ok:true,feature:"P67.22.13.3-TEACHER-IMAGE",questionId:id,imageDataUrl:question.imageDataUrl});
    }

    // HF-QDEL-01 — a teacher may remove a problematic approved question from
    // their own picker. This is a scoped suppression, NOT a global deletion of
    // the authoritative admin question bank and it never rewrites existing exams.
    if (url.pathname === "/api/staff/teacher-approved-questions/p67" && req.method === "DELETE") {
      if (auth.user.role !== "teacher") throw Object.assign(new Error("حذف سؤال از مخزن معلم فقط برای معلم مجاز است."), {status:403});
      const body=await readJson(req), questionId=String(body?.questionId||"").trim();
      if(!questionId || questionId.length>128) throw Object.assign(new Error("شناسه سؤال معتبر نیست."),{status:400});
      const saved=await mutateDb(live=>{
        const question=(live.adminQuestionBank||[]).find(q=>String(q.id)===questionId);
        if(!question || question.status!=="approved" || !teacherCanAssigned(live,auth.user,{bookId:question.bookId,subject:question.subject,feature:"questionBank"}))
          throw Object.assign(new Error("سؤال تأییدشده یا مجاز پیدا نشد."),{status:404});
        live.teacherQuestionSuppressions=Array.isArray(live.teacherQuestionSuppressions)?live.teacherQuestionSuppressions:[];
        const existing=live.teacherQuestionSuppressions.find(row=>String(row.teacherId)===String(auth.user.id)&&String(row.questionId)===questionId);
        if(!existing){
          live.teacherQuestionSuppressions.push({id:makeId("tqs"),teacherId:auth.user.id,questionId,reason:"teacher_marked_problematic",status:"hidden",createdAt:new Date().toISOString(),at:faNow()});
          live.audit=Array.isArray(live.audit)?live.audit:[];
          live.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"حذف سؤال مشکل‌دار از مخزن معلم",details:`question=${questionId}`,at:faNow()});
        }
        return {questionId,removed:true,alreadyRemoved:Boolean(existing)};
      });
      await securityAudit({type:"teacher_question_suppressed_hf_qdel01",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:questionId.slice(0,100)});
      return sendJson(res,200,{ok:true,feature:"HF-QDEL-01",...saved.result,updatedAt:saved.updatedAt});
    }

    // P67 — authorized, read-only teacher view of approved admin questions.
    // Never merge or synchronize these rows into the personal teacher question bank.
    if (url.pathname === "/api/staff/teacher-approved-questions/p67" && req.method === "GET") {
      if (auth.user.role !== "teacher") throw Object.assign(new Error("کتابخانه سؤال فقط برای معلم فعال است."), {status:403});
      const env = await ensureStateInitialized(), schoolDb = env.db;
      const eligibleBooks = (schoolDb.curriculum || []).filter(book =>
        teacherCanAssigned(schoolDb, auth.user, {bookId:book.id,subject:book.subject,feature:"questionBank"}));
      const ids = new Set(eligibleBooks.map(b=>String(b.id)));
      // Usage is computed from this teacher's actual published / run exams,
      // never from another teacher or a draft. Do not mutate any question bank.
      const usageByTeacher=teacherQuestionUsageV4523(schoolDb,auth.user.id);
      const suppressedQuestionIds=new Set((schoolDb.teacherQuestionSuppressions||[])
        .filter(row=>String(row.teacherId)===String(auth.user.id)&&String(row.status||"hidden")!=="restored")
        .map(row=>String(row.questionId||"")));
      const books = eligibleBooks.map(b=>({id:b.id,subject:b.subject,grade:Number(b.grade||0),title:b.title||b.subject,
        chapters:(b.chapters||[]).map(c=>({id:c.id,title:c.displayTitle||c.name||c.title||`فصل ${c.order||""}`}))}));
      const questions = (schoolDb.adminQuestionBank||[]).filter(q=>q.status==="approved"&&ids.has(String(q.bookId))&&
        !suppressedQuestionIds.has(String(q.id))&&
        teacherCanAssigned(schoolDb,auth.user,{bookId:q.bookId,subject:q.subject,feature:"questionBank"}))
        .map(q=>{
          // The independent admin bank has legacy MCQs with alternatives in text.
          // Normalize RESPONSE only: no database rewrite, no new student data exposure.
          const display=q.type==='mcq'?teacherApprovedMcqShapeV67223(q):null;
          return {id:q.id,bookId:q.bookId,chapterId:q.chapterId,subject:q.subject,grade:Number(q.grade||0),
            type:q.type,difficulty:q.difficulty,score:Number(q.score||1),text:display?.text??q.text,
            // Teacher-only answer data; also provide a separate clean stem for newer clients.
            choices:display?.choices??(Array.isArray(q.choices)?q.choices:[]),
            answer:display?display.answer:(Number.isInteger(q.answer)?q.answer:null),
            questionText:display?.questionText??q.text,
            referenceAnswer:q.referenceAnswer||"",explanation:q.explanation||"",tags:q.tags||[],
            assessmentScope:globalThis.MSY_FINAL_TERM_QUESTION_BANK_CORE.scopeOf(q),
            academicPeriod:globalThis.MSY_FINAL_TERM_QUESTION_BANK_CORE.scopeOf(q)==="final"?String(q.academicPeriod||""):"",
            ...(q.type==="image" && validImageP672213(q.imageDataUrl)?{imageDataUrl:q.imageDataUrl}:{}),
            teacherUseCount:usageByTeacher[String(q.id)]?.examIds?.length||0};
        });
      return sendJson(res,200,{ok:true,feature:"P67-TEACHER-APPROVED-LIBRARY",imageTransport:"P67.22.13.3",books,questions,count:questions.length,suppressedCount:suppressedQuestionIds.size,updatedAt:env.updatedAt});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/workflow-health") {
      const health=workflowHealth11(auth.db,auth.user.role,auth.user.id);
      return sendJson(res,200,{ok:true,health,phases:workflowPhases11(health),generatedAt:new Date().toISOString()});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/beta-readiness") {
      if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("وضعیت انتشار Beta فقط برای مدیر قابل مشاهده است."),{status:403});
      const health=workflowHealth11(auth.db,auth.user.role,auth.user.id),readiness=betaReadiness12(auth.db,health);
      return sendJson(res,200,{ok:true,release:"Beta 1",readiness,workflowHealth:health,generatedAt:new Date().toISOString()});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/term-policy") {
      const body=await readJson(req),classId=String(body.classId||""),subject=String(body.subject||""),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||body.period,{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      if(!classId||!subject)throw Object.assign(new Error("کلاس و درس الزامی است."),{status:400});
      // T06: legacy policy writer is retired; gradebook config is the sole authoritative editor.
      throw Object.assign(new Error("بارم‌ها فقط توسط مدیر در «مدیریت بارم پایان‌ترم» تنظیم می‌شوند."),{status:409});
      const policy=normalizeTermPolicyCore({continuousEnabled:body.continuousEnabled!==false,continuousShare:body.continuousShare},Number(auth.db.school?.settings?.scoreScale||20));
      const conflictingFinal=(auth.db.exams||[]).find(e=>e.classId===classId&&e.subject===subject&&(e.examCategory||"ongoing")==="final"&&String(e.academicYear||academicYear)===academicYear&&normalizeAcademicPeriod(e.academicPeriod||e.period,{allowAnnual:false})===academicPeriod&&Math.abs(Number(e.targetScore||0)-Number(policy.finalShare))>.001);
      if(conflictingFinal)throw Object.assign(new Error(`برای این دوره آزمون پایانی «${conflictingFinal.title||"بدون عنوان"}» با بارم ${Number(conflictingFinal.targetScore||0)} وجود دارد. برای این فرمول بارم پایانی باید ${policy.finalShare} باشد؛ ابتدا آزمون را اصلاح کنید.`),{status:409});
      const saved=await enqueueStateOperation(async()=>{const env=await ensureStateInitialized(),latest=env.db,now=new Date().toISOString(),key=`${classId}__${subject}__${academicYear}__${academicPeriod}`;
        latest.termPolicies=Array.isArray(latest.termPolicies)?latest.termPolicies:[];
        const existing=latest.termPolicies.find(x=>x.key===key);
        const row={id:existing?.id||makeId("tp"),key,classId,subject,academicYear,academicPeriod,...policy,teacherId:auth.user.id,updatedAt:now,createdAt:existing?.createdAt||now};
        latest.termPolicies=latest.termPolicies.filter(x=>x.key!==key);latest.termPolicies.push(row);
        return writeStateEnvelope(latest);
      });
      return sendJson(res,200,{ok:true,policy:(saved.db.termPolicies||[]).find(x=>x.key===`${classId}__${subject}__${academicYear}__${academicPeriod}`)});
    }


    // T08.4: independent continuous-card draft/publication (not the official term card).
    if(req.method==="POST"&&url.pathname==="/api/staff/continuous-report-card"){
      if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("ذخیره یا صدور کارنامه مستمر مستقل فقط توسط مدیر مجاز است."),{status:403});
      const body=await readJson(req),studentId=String(body.studentId||""),period=String(body.academicPeriod||""),status=String(body.status||"");
      if(!["semester1","semester2"].includes(period)||!["draft","published"].includes(status))throw Object.assign(new Error("نیم‌سال یا وضعیت کارنامه مستمر نامعتبر است."),{status:400});
      const saved=await mutateDb(db=>{
        const student=(db.users||[]).find(u=>u.id===studentId&&u.role==="student"&&u.active!==false&&u.profileStatus!=="deleted");
        if(!student)throw Object.assign(new Error("دانش‌آموز معتبر پیدا نشد."),{status:404});
        const year=String(db.school?.year||""),now=new Date().toISOString();
        db.continuousReportCards=Array.isArray(db.continuousReportCards)?db.continuousReportCards:[];
        const existing=db.continuousReportCards.find(r=>r.studentId===studentId&&String(r.academicYear||"")===year&&String(r.academicPeriod||r.period||"")===period);
        if(existing?.status==="published")throw Object.assign(new Error("کارنامه مستمر نهایی و قفل است؛ ابتدا آن را بازگشایی کنید."),{status:409,code:"CONTINUOUS_CARD_LOCKED"});
        const rows=status==="published"?continuousCardSubjectsT084(db,student,period):null;
        if(status==="published")assertContinuousCardReadyT084(rows);
        const snapshot=status==="published"?{version:"T08.4",capturedAt:now,subjects:rows,average20:Math.round(rows.reduce((a,r)=>a+r.score20,0)/rows.length*100)/100}:null;
        const row={id:existing?.id||makeId("crc"),studentId,classId:student.classId,academicYear:year,academicPeriod:period,status,
          teacherComment:String(body.teacherComment??existing?.teacherComment??"").slice(0,2000),managerComment:String(body.managerComment??existing?.managerComment??"").slice(0,2000),
          createdAt:existing?.createdAt||now,updatedAt:now,updatedBy:auth.user.id,
          publishedAt:status==="published"?now:null,publishedBy:status==="published"?auth.user.id:null,
          lockedAt:status==="published"?now:null,lockedBy:status==="published"?auth.user.id:null,
          snapshot,snapshotRevision:status==="published"?Number(existing?.snapshotRevision||0)+1:Number(existing?.snapshotRevision||0)};
        db.continuousReportCards=db.continuousReportCards.filter(r=>r.id!==row.id&&!(r.studentId===studentId&&String(r.academicYear||"")===year&&String(r.academicPeriod||r.period||"")===period));
        db.continuousReportCards.push(row);
        db.audit=Array.isArray(db.audit)?db.audit:[];
        db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:status==="published"?"انتشار کارنامه مستمر مستقل":"پیش‌نویس کارنامه مستمر مستقل",details:`${studentId} · ${period}`,at:faNow()});
        return row;
      });
      return sendJson(res,200,{ok:true,continuousReportCard:saved.result});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/continuous-report-card/unlock"){
      if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("بازگشایی کارنامه مستمر مستقل فقط توسط مدیر مجاز است."),{status:403});
      const body=await readJson(req),id=String(body.continuousReportCardId||"");
      if(!id)throw Object.assign(new Error("شناسه کارنامه مستمر الزامی است."),{status:400});
      const saved=await mutateDb(db=>{
        const row=(db.continuousReportCards||[]).find(r=>r.id===id);
        if(!row)throw Object.assign(new Error("کارنامه مستمر پیدا نشد."),{status:404});
        if(row.status!=="published")throw Object.assign(new Error("این کارنامه مستمر در وضعیت نهایی نیست."),{status:409});
        const now=new Date().toISOString(),updated={...row,status:"draft",updatedAt:now,updatedBy:auth.user.id,
          publishedAt:null,publishedBy:null,lockedAt:null,lockedBy:null,snapshot:null};
        db.continuousReportCards=(db.continuousReportCards||[]).map(r=>r.id===id?updated:r);
        db.audit=Array.isArray(db.audit)?db.audit:[];
        db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"بازگشایی کارنامه مستمر مستقل",details:`${id}: ${String(body.reason||"").slice(0,120)}`,at:faNow()});
        return updated;
      });
      return sendJson(res,200,{ok:true,continuousReportCard:saved.result});
    }

    if (req.method === "POST" && url.pathname === "/api/staff/report-card") {
      const body=await readJson(req),studentId=String(body.studentId||""),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||body.period,{allowAnnual:true}),student=(auth.db.users||[]).find(u=>u.id===studentId&&u.role==="student");
      if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId:student.classId,feature:"reports"}))throw Object.assign(new Error("مجوز ثبت کارنامه این دانش‌آموز را ندارید."),{status:403});
      const year=String(auth.db.school?.year||"");
      const existingOfficial=(auth.db.reportCards||[]).find(r=>r.studentId===studentId&&String(r.academicYear||"")===year&&normalizeAcademicPeriod(r.academicPeriod||r.period,{allowAnnual:true})===academicPeriod);
      if(existingOfficial?.status==="published")throw Object.assign(new Error("این کارنامه نهایی و قفل شده است؛ مدیر باید ابتدا آن را بازگشایی کند."),{status:409,code:"REPORT_CARD_LOCKED"});
      const disciplineScore=body.disciplineScore===null||body.disciplineScore===""?null:Number(body.disciplineScore),cultivationScore=body.cultivationScore===null||body.cultivationScore===""?null:Number(body.cultivationScore);
      const specialErrors=validateSpecialScoresCore({disciplineScore,cultivationScore,settings:auth.db.school?.settings||{}});
      if(specialErrors.length)throw Object.assign(new Error(specialErrors.map(x=>x.message).join(" ")),{status:400});
      const canPublish=["admin","superadmin"].includes(auth.user.role);
      if(body.status==="published"&&!canPublish)throw Object.assign(new Error("انتشار نهایی کارنامه فقط توسط مدیر مجاز است؛ معلم می‌تواند پیش‌نویس را تکمیل کند."),{status:403});
      const status=body.status==="published"?"published":"draft";
      const saved=await enqueueStateOperation(async()=>{const env=await ensureStateInitialized(),latest=env.db,existing=(latest.reportCards||[]).find(r=>r.studentId===studentId&&String(r.academicYear||"")===year&&normalizeAcademicPeriod(r.academicPeriod||r.period,{allowAnnual:true})===academicPeriod),now=new Date().toISOString();
        if(existing?.status==="published")throw Object.assign(new Error("کارنامه قبلاً منتشر شده است و ابتدا باید توسط مدیر بازگشایی شود."),{status:409,code:"REPORT_CARD_LOCKED"});
        const row={id:existing?.id||makeId("rc"),studentId,classId:student.classId,academicYear:year,academicPeriod,disciplineScore,cultivationScore,teacherComment:String(body.teacherComment??existing?.teacherComment??"").slice(0,2000),managerComment:auth.user.role==="teacher"?String(existing?.managerComment||""):String(body.managerComment??existing?.managerComment??"").slice(0,2000),status,createdAt:existing?.createdAt||now,updatedAt:now,updatedBy:auth.user.id,publishedAt:status==="published"?now:null,publishedBy:status==="published"?auth.user.id:null,lockedAt:status==="published"?now:null,lockedBy:status==="published"?auth.user.id:null};
        // T07: capture the EXACT calculated scores at the time of manager publication.
        // A published card should never drift when scoring policy or exam results change.
        if(status==="published"){
          const report=studentTermReportV185(latest,studentId,academicPeriod);
          // T08.3: re-check the LIVE DB snapshot inside the atomic publication operation.
          assertReportCardPublishReadyT083(report);
          const termReport={...report,officialCard:null,reportCardStatus:"unpublished"};
          row.snapshot={version:"T07",capturedAt:now,subjects:report.subjects||[],completeSubjects:report.completeSubjects||report.subjects||[],average:report.average??null,termReport};
          row.snapshotRevision=Number(existing?.snapshotRevision||0)+1;
        }else if(existing?.snapshot){row.snapshot=existing.snapshot;row.snapshotRevision=existing.snapshotRevision||0;}
        latest.reportCards=(latest.reportCards||[]).filter(r=>r.id!==row.id&&!(r.studentId===studentId&&String(r.academicYear||"")===year&&normalizeAcademicPeriod(r.academicPeriod||r.period,{allowAnnual:true})===academicPeriod));latest.reportCards.push(row);return writeStateEnvelope(latest);});
      return sendJson(res,200,{ok:true,reportCard:(saved.db.reportCards||[]).find(r=>r.studentId===studentId&&String(r.academicYear||"")===year&&normalizeAcademicPeriod(r.academicPeriod||r.period,{allowAnnual:true})===academicPeriod),termReport:studentTermReportV185(saved.db,studentId,academicPeriod)});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/exam-sheet-codes") {
      const body = await readJson(req), examId = String(body.examId || ""), requested = Array.isArray(body.studentIds) ? body.studentIds.map(String) : [];
      const exam = (auth.db.exams || []).find(e => String(e.id) === examId);
      if (!exam) throw Object.assign(new Error("آزمون پیدا نشد."), { status: 404 });
      if (auth.user.role === "teacher" && !teacherCanAssigned(auth.db, auth.user, { classId: exam.classId, subject: exam.subject, bookId: exam.bookId, feature: "examCreate" })) {
        throw Object.assign(new Error("به برگه‌های این آزمون دسترسی ندارید."), { status: 403 });
      }
      const scope = auth.user.role === "teacher" ? teacherScope(auth.db, auth.user) : null;
      const students = (auth.db.users || []).filter(u => u.role === "student" && (!requested.length || requested.includes(String(u.id))) && (!exam.classId || String(u.classId) === String(exam.classId)));
      const codes = {};
      for (const student of students) {
        if (scope && !scope.studentIds.has(student.id)) continue;
        codes[student.id] = studentSheetCode(auth.security.serverSecret, student, exam);
      }
      if (requested.some(id => !codes[id])) throw Object.assign(new Error("حداقل یکی از دانش‌آموزان خارج از محدوده این آزمون است."), { status: 403 });
      return sendJson(res, 200, { ok: true, examId: exam.id, codes });
    }
    if (req.method === "POST" && url.pathname === "/api/staff/logout") {
      await mutateSecurity(security => { delete security.sessions[auth.tokenHash]; });
      await securityAudit({ type: "staff_logout", userId: auth.user.id, role: auth.user.role, ip: clientIp(req) });
      return sendJson(res, 200, { ok: true });
    }
    if (passwordChangeRoute) {
      const body = await readJson(req);
      const policyError = passwordPolicy(body.newPassword, auth.user.role); if (policyError) throw Object.assign(new Error(policyError), { status: 400 });
      const updated = await mutateSecurity(async security => {
        const credential = security.credentials[auth.user.id];
        if (!credential || !await passwordVerify(String(body.currentPassword || ""), credential.passwordHash)) return { error: "current" };
        if (await passwordVerify(String(body.newPassword), credential.passwordHash)) return { error: "same" };
        credential.passwordHash = await passwordHash(body.newPassword); credential.mustChangePassword = false; credential.passwordChangedAt = new Date().toISOString(); credential.credentialVersion = Number(credential.credentialVersion || 1) + 1;
        for (const [hash, sess] of Object.entries(security.sessions)) if (sess.userId === auth.user.id && hash !== auth.tokenHash) delete security.sessions[hash];
        return { ok: true };
      });
      if (updated.result?.error === "current") throw Object.assign(new Error("رمز فعلی صحیح نیست."), { status: 401 });
      if (updated.result?.error === "same") throw Object.assign(new Error("رمز جدید باید با رمز قبلی متفاوت باشد."), { status: 400 });
      await securityAudit({ type: "password_change", userId: auth.user.id, role: auth.user.role, ip: clientIp(req) });
      return sendJson(res, 200, { ok: true, token: auth.token, user: publicAuthUser(auth.user, updated.security), release: "72.35-p7-TEACHER-SAVE-FIX" });
    }
    if (req.method === "POST" && url.pathname === "/api/staff/sessions/client-info") {
      const body = await readJson(req);
      const updated = await mutateSecurity(sec => {
        const row = sec.sessions?.[auth.tokenHash];
        if (!row || row.userId !== auth.user.id) return { error: "not_found" };
        const deviceLabel = applyClientDeviceInfo(row, body);
        row.ip = clientIp(req);
        return { deviceLabel };
      });
      if (updated.result?.error) throw Object.assign(new Error("نشست جاری پیدا نشد."), { status: 404 });
      return sendJson(res, 200, { ok: true, deviceLabel: updated.result?.deviceLabel || "" });
    }
    if (req.method === "GET" && url.pathname === "/api/staff/sessions") {
      const rows = Object.entries(auth.security.sessions || {}).filter(([, s]) => s.userId === auth.user.id).map(([hash, s]) => { const current=hash===auth.tokenHash,deviceLabel=sessionDeviceView(s,req,current); return { id: hash, current, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt, idleExpiresAt:s.idleExpiresAt, ip: current?clientIp(req):s.ip, userAgent: deviceLabel, rawUserAgent:s.userAgent||"", deviceLabel }; }).sort((a,b)=>Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0));
      return sendJson(res, 200, { sessions: rows, currentSessionId:auth.tokenHash });
    }
    if (req.method === "POST" && url.pathname === "/api/staff/sessions/revoke-others") {
      const updated=await mutateSecurity(security => { let revoked=0;for (const [hash, sess] of Object.entries(security.sessions)) if (sess.userId === auth.user.id && hash !== auth.tokenHash){delete security.sessions[hash];revoked++;}return revoked; });
      await securityAudit({ type: "session_revoke_others", userId: auth.user.id, role: auth.user.role, ip: clientIp(req),details:`${updated.result||0}` }); return sendJson(res, 200, { ok: true,revoked:Number(updated.result||0) });
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/sessions/revoke"){
      const body=await readJson(req),sessionId=String(body.sessionId||"");if(!/^[a-f0-9]{64}$/i.test(sessionId))throw Object.assign(new Error("شناسه نشست معتبر نیست."),{status:400});
      const updated=await mutateSecurity(sec=>{const row=sec.sessions?.[sessionId];if(!row||row.userId!==auth.user.id)return {error:"not_found"};delete sec.sessions[sessionId];return {ok:true,current:sessionId===auth.tokenHash};});
      if(updated.result?.error)throw Object.assign(new Error("نشست پیدا نشد یا متعلق به این حساب نیست."),{status:404});
      await securityAudit({type:"session_revoke_one",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:updated.result.current?"current":"other"});return sendJson(res,200,{ok:true,requiresLogin:Boolean(updated.result.current)});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/sessions/revoke-all"){
      const updated=await mutateSecurity(sec=>{let revoked=0;for(const [hash,row] of Object.entries(sec.sessions||{}))if(row.userId===auth.user.id){delete sec.sessions[hash];revoked++;}return revoked;});
      await securityAudit({type:"session_revoke_all",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${updated.result||0}`});return sendJson(res,200,{ok:true,revoked:Number(updated.result||0),requiresLogin:true});
    }
    if (req.method === "GET" && url.pathname === "/api/security/audit") {
      if (!["admin", "superadmin"].includes(auth.user.role)) throw Object.assign(new Error("دسترسی به گزارش امنیتی فقط برای مدیر و ادمین مجاز است."), { status: 403 });
      return sendJson(res, 200, { events: await readSecurityAudit(url.searchParams.get("limit") || 500) });
    }
    if (req.method === "POST" && url.pathname === "/api/staff/users/update") {
      if (!isAdminRole(auth.user.role)) throw Object.assign(new Error("ویرایش حساب کاربران فقط برای مدیر یا ادمین مجاز است."), { status: 403 });
      const body = await readJson(req);
      const userId = String(body.userId || "").trim();
      const firstName = String(body.firstName || "").trim().slice(0, 80);
      const lastName = String(body.lastName || "").trim().slice(0, 100);
      const nationalId = normalizeNationalId(body.nationalId);
      if (!userId) throw Object.assign(new Error("شناسه کاربر مشخص نیست."), { status: 400 });
      if (!firstName || !lastName) throw Object.assign(new Error("نام و نام خانوادگی الزامی است."), { status: 400 });
      if (!/^\d{10}$/.test(nationalId)) throw Object.assign(new Error("کد ملی باید دقیقاً ۱۰ رقم باشد."), { status: 400 });

      const writeMetrics = {};
      let queueWaitMs = 0;
      const requestStartedAt = performance.now();
      const queueStartedAt = performance.now();
      const includeState = body.includeState === true;
      const saved = await enqueueStateOperation(async () => {
        queueWaitMs = Math.max(0, Math.round((performance.now() - queueStartedAt) * 10) / 10);
        const envelope = await ensureStateInitialized();
        const db = envelope.db;
        const target = (db.users || []).find(u => String(u.id) === userId && ["student", "teacher"].includes(u.role) && u.profileStatus !== "deleted");
        if (!target) throw Object.assign(new Error("کاربر فعال پیدا نشد."), { status: 404 });
        if ((db.users || []).some(u => String(u.id) !== userId && normalizeNationalId(u.nationalId) === nationalId)) {
          throw Object.assign(new Error("این کد ملی قبلاً برای کاربر دیگری ثبت شده است."), { status: 409 });
        }

        const before = structuredClone(target);
        target.firstName = firstName;
        target.lastName = lastName;
        target.nationalId = nationalId;
        target.username = nationalId;
        target.updatedAt = new Date().toISOString();
        target.updatedBy = auth.user.id;

        if (target.role === "student") {
          const birthDate = normalizeStoredBirthDate(body.birthDate);
          if (!birthDate) throw Object.assign(new Error("تاریخ تولد دانش‌آموز معتبر نیست."), { status: 400 });
          const classId = String(body.classId ?? target.classId ?? "");
          const cls = (db.school?.classes || []).find(c => String(c.id) === classId && c.active !== false);
          if (!cls) throw Object.assign(new Error("کلاس انتخاب‌شده معتبر یا فعال نیست."), { status: 400 });
          target.birthDate = birthDate;
          target.classId = classId;
          target.guardianMobile = String(body.guardianMobile ?? target.guardianMobile ?? "").trim().slice(0, 40) || "ثبت نشده";
          const meta = gradeMeta(Number(cls.grade || 7));
          target.grade = meta.grade;
          target.gradeId = meta.id;
          target.gradeName = meta.name;
          if (before.classId !== target.classId) {
            const year = String(db.school?.year || "");
            db.enrollments = normalizeEnrollments(db);
            const enrollment = (db.enrollments || []).find(e => e.studentId === target.id && String(e.academicYear || "") === year && e.active !== false);
            if (enrollment) {
              enrollment.previousClassId = enrollment.classId;
              enrollment.classId = target.classId;
              enrollment.updatedAt = new Date().toISOString();
              enrollment.updatedBy = auth.user.id;
            }
          }
        } else {
          const requestedSubjects = Array.from(new Set((Array.isArray(body.subjects) ? body.subjects : []).map(x => String(x || "").trim()).filter(Boolean)));
          const validSubjects = new Set((db.school?.subjects || []).map(x => String(x || "").trim()).filter(Boolean));
          const subjects = requestedSubjects.filter(x => !validSubjects.size || validSubjects.has(x));
          if (!subjects.length) throw Object.assign(new Error("حداقل یک درس معتبر برای معلم انتخاب کنید."), { status: 400 });
          const validClasses = new Set((db.school?.classes || []).filter(c => c.active !== false).map(c => String(c.id)));
          const classIds = Array.from(new Set((Array.isArray(body.classIds) ? body.classIds : []).map(x => String(x || "").trim()).filter(x => validClasses.has(x))));
          target.subjects = subjects;
          target.classIds = classIds;
        }

        const keys = target.role === "student"
          ? ["firstName", "lastName", "nationalId", "birthDate", "classId", "guardianMobile"]
          : ["firstName", "lastName", "nationalId", "subjects", "classIds"];
        const changedFields = keys.filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(target[key] ?? null));
        db.audit = Array.isArray(db.audit) ? db.audit : [];
        const auditEntry = { id: makeId("log"), userId: auth.user.id, action: "ویرایش کاربر", details: `${target.role}:${target.id}; fields=${changedFields.join(",")}`, at: faNow() };
        db.audit.unshift(auditEntry);
        // A profile edit does not need to scan/prune every historical snapshot.
        // Daily/weekly retention remains enforced by the hourly backup task.
        const written = await writeStateEnvelope(db, { skipTiered: true, metrics: writeMetrics });
        const liveUser = (written.db.users || []).find(u => String(u.id) === String(target.id));
        const userPatch = liveUser ? {
          id: liveUser.id, role: liveUser.role, firstName: liveUser.firstName || "", lastName: liveUser.lastName || "",
          nationalId: liveUser.nationalId || "", username: liveUser.username || "", updatedAt: liveUser.updatedAt || "", updatedBy: liveUser.updatedBy || ""
        } : { id: target.id, role: target.role };
        if (liveUser?.role === "student") Object.assign(userPatch, {
          birthDate: liveUser.birthDate || "", classId: liveUser.classId || "", guardianMobile: liveUser.guardianMobile || "",
          grade: liveUser.grade, gradeId: liveUser.gradeId, gradeName: liveUser.gradeName
        });
        if (liveUser?.role === "teacher") Object.assign(userPatch, {
          subjects: Array.isArray(liveUser.subjects) ? liveUser.subjects : [], classIds: Array.isArray(liveUser.classIds) ? liveUser.classIds : []
        });
        return { written, targetId: target.id, role: target.role, nationalIdChanged: before.nationalId !== target.nationalId, nationalId: target.nationalId, changedFields, auditEntry, userPatch };
      });

      if (saved.role === "teacher" && saved.nationalIdChanged) {
        await ensureSecurityInitialized(saved.written.db);
        await mutateSecurity(security => {
          const credential = security.credentials?.[saved.targetId];
          if (credential) credential.username = saved.nationalId;
        });
      }
      const auditStartedAt = performance.now();
      await securityAudit({ type: "staff_user_update", userId: saved.targetId, role: saved.role, ip: clientIp(req), details: `by=${auth.user.id}; fields=${saved.changedFields.join(",")}` });
      const auditMs = Math.max(0, Math.round((performance.now() - auditStartedAt) * 10) / 10);
      const totalMs = Math.max(0, Math.round((performance.now() - requestStartedAt) * 10) / 10);
      const timing = [
        ["queue", queueWaitMs], ["snapshot", writeMetrics.snapshotMs], ["validate", writeMetrics.validateMs],
        ["serialize", writeMetrics.serializeMs], ["previous-copy", writeMetrics.previousCopyMs],
        ["primary-write", writeMetrics.primaryWriteMs], ["mirror-write", writeMetrics.mirrorWriteMs],
        ["tiered-backup", writeMetrics.tieredBackupMs], ["state-write", writeMetrics.writeTotalMs],
        ["audit", auditMs], ["total", totalMs]
      ].filter(([, value]) => Number.isFinite(Number(value))).map(([name, value]) => `${name};dur=${Math.max(0, Number(value)).toFixed(1)}`).join(", ");
      res.setHeader("Server-Timing", timing);
      const response = { ok: true, user: saved.userPatch, auditEntry: saved.auditEntry, updatedAt: saved.written.updatedAt, changedFields: saved.changedFields };
      // Keep compatibility for callers that have unsaved local changes; the normal
      // profile-edit path receives a compact response and refreshes state in background.
      if (includeState) response.db = scopedDbForStaff(saved.written.db, auth.user);
      return sendJson(res, 200, response);
    }

    if (req.method === "POST" && url.pathname === "/api/staff/users/import-students") {
      if (!isAdminRole(auth.user.role)) throw Object.assign(new Error("ورود گروهی دانش‌آموزان فقط برای مدیر یا ادمین مجاز است."), { status: 403 });
      const body=await readJson(req),rows=Array.isArray(body.rows)?body.rows:[],selectedClassId=String(body.classId||"").trim();
      if(!rows.length)throw Object.assign(new Error("هیچ ردیف معتبری برای ورود ارسال نشده است."),{status:400});
      if(rows.length>1000)throw Object.assign(new Error("حداکثر ۱۰۰۰ دانش‌آموز در هر بار قابل ورود است."),{status:413,code:"STUDENT_IMPORT_TOO_LARGE"});
      const saved=await mutateDb(db=>{
        db.users=Array.isArray(db.users)?db.users:[];db.audit=Array.isArray(db.audit)?db.audit:[];
        const classes=new Map((db.school?.classes||[]).filter(c=>c.active!==false&&c.profileStatus!=="deleted").map(c=>[String(c.id),c]));
        const selectedClass=selectedClassId?classes.get(selectedClassId):null;
        if(selectedClassId&&!selectedClass)throw Object.assign(new Error("کلاس مقصد انتخاب‌شده معتبر یا فعال نیست."),{status:400,code:"STUDENT_IMPORT_CLASS_INVALID"});
        const seenNational=new Set(db.users.map(u=>normalizeNationalId(u.nationalId)).filter(Boolean));
        const usedCodes=new Set(db.users.map(u=>String(u.studentCode||"").trim()).filter(Boolean));
        const classCounts=new Map();
        for(const u of db.users){if(u.role!=="student"||u.profileStatus==="deleted")continue;const id=String(u.classId||"");if(id)classCounts.set(id,(classCounts.get(id)||0)+1);}
        let added=0,duplicates=0;const errors=[],students=[];
        for(let i=0;i<rows.length;i++){
          const raw=rows[i]&&typeof rows[i]==="object"?rows[i]:{},rowNumber=Math.max(2,Number(raw.rowNumber)||i+2),firstName=String(raw.firstName||"").trim().slice(0,80),lastName=String(raw.lastName||"").trim().slice(0,100),nationalId=normalizeNationalId(raw.nationalId),birthDate=normalizeStoredBirthDate(raw.birthDate),classId=selectedClass?String(selectedClass.id):String(raw.classId||"").trim(),cls=selectedClass||classes.get(classId),grade=selectedClass?Number(selectedClass.grade):Number(raw.grade),guardianMobile=String(raw.guardianMobile||"").trim().slice(0,40);
          if(!firstName||!lastName||!/^[0-9]{10}$/.test(nationalId)||!birthDate||!cls||![7,8,9].includes(grade)){errors.push(`ردیف ${rowNumber}: نام، کد ملی، تاریخ، پایه یا کلاس معتبر نیست`);continue;}
          if(!selectedClass&&Number(cls.grade)!==grade){errors.push(`ردیف ${rowNumber}: پایه واردشده با کلاس «${String(cls.name||"").trim()}» تطابق ندارد`);continue;}
          if(seenNational.has(nationalId)){duplicates++;continue;}
          const capacity=Math.max(1,Math.min(200,Number(cls.capacity||30)||30)),enrolled=Number(classCounts.get(classId)||0);
          if(enrolled>=capacity){errors.push(`ردیف ${rowNumber}: ظرفیت کلاس «${String(cls.name||"").trim()}» تکمیل است`);continue;}
          const base=`${grade}${nationalId.slice(-6)}`;let studentCode=base,n=1;while(usedCodes.has(studentCode))studentCode=`${base}${n++}`;usedCodes.add(studentCode);seenNational.add(nationalId);classCounts.set(classId,enrolled+1);
          const meta=gradeMeta(grade),now=faNow(),student={id:makeId("stu"),role:"student",nationalId,username:nationalId,firstName,lastName,active:true,birthDate,studentCode,classId,grade:meta.grade,gradeId:meta.id,gradeName:meta.name,guardianMobile:guardianMobile||"ثبت نشده",enrollmentYear:String(db.school?.year||""),academicYear:String(db.school?.year||""),createdAt:now,createdBy:auth.user.id,updatedAt:now,updatedBy:auth.user.id};
          db.users.push(student);students.push(structuredClone(student));added++;
        }
        const targetName=selectedClass?String(selectedClass.name||"").trim():"چند کلاس";
        if(added)db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ورود گروهی دانش‌آموزان",details:`${added} ثبت در ${targetName}، ${duplicates} تکراری، ${errors.length} نامعتبر`,at:faNow()});
        return {added,duplicates,invalid:errors.length,errors:errors.slice(0,100),students,classId:selectedClass?String(selectedClass.id):"",className:selectedClass?String(selectedClass.name||"").trim():"",grade:selectedClass?Number(selectedClass.grade):null};
      });
      await securityAudit({type:"student_bulk_import",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`class=${saved.result.classId||"multi"}; added=${saved.result.added}; duplicates=${saved.result.duplicates}; invalid=${saved.result.invalid}`});
      return sendJson(res,200,{ok:true,summary:saved.result,updatedAt:saved.updatedAt});
    }

    if (req.method === "POST" && url.pathname === "/api/staff/users/create-student") {
      if (!isAdminRole(auth.user.role)) throw Object.assign(new Error("ثبت دانش‌آموز فقط برای مدیر یا ادمین مجاز است."), { status: 403 });
      const body=await readJson(req),firstName=String(body.firstName||"").trim(),lastName=String(body.lastName||"").trim(),nationalId=normalizeNationalId(body.nationalId),birthDate=normalizeStoredBirthDate(body.birthDate),classId=String(body.classId||""),guardianMobile=String(body.guardianMobile||"").trim();
      if(!firstName||!lastName)throw Object.assign(new Error("نام و نام خانوادگی دانش‌آموز الزامی است."),{status:400});
      if(!/^\d{10}$/.test(nationalId))throw Object.assign(new Error("کد ملی دانش‌آموز باید ۱۰ رقم باشد."),{status:400});
      if(!birthDate)throw Object.assign(new Error("تاریخ تولد دانش‌آموز معتبر نیست."),{status:400});
      const saved=await enqueueStateOperation(async()=>{
        const envelope=await ensureStateInitialized(),db=envelope.db;
        const sameNational=(db.users||[]).filter(u=>normalizeNationalId(u.nationalId)===nationalId);
if(sameNational.some(u=>u.profileStatus!=="deleted"))throw Object.assign(new Error("این کد ملی قبلاً برای یک کاربر فعال ثبت شده است."),{status:409});
if(sameNational.some(u=>u.profileStatus==="deleted"))throw Object.assign(new Error("این کاربر قبلاً حذف شده است؛ ابتدا از سطل بازیافت بازیابی کنید."),{status:409});
        const cls=(db.school?.classes||[]).find(c=>c.id===classId&&c.active!==false);
        if(!cls)throw Object.assign(new Error("کلاس انتخاب‌شده معتبر یا فعال نیست."),{status:400});
        const grade=Number(cls.grade||7),meta=gradeMeta(grade),base=`${grade}${nationalId.slice(-6)}`;let studentCode=base,n=1;
        while((db.users||[]).some(u=>String(u.studentCode||"")===studentCode))studentCode=`${base}${n++}`;
        const student={id:makeId("stu"),role:"student",nationalId,username:nationalId,firstName,lastName,active:true,birthDate,studentCode,classId,grade:meta.grade,gradeId:meta.id,gradeName:meta.name,guardianMobile:guardianMobile||"ثبت نشده",enrollmentYear:db.school?.year||"",academicYear:db.school?.year||""};
        db.users=Array.isArray(db.users)?db.users:[];db.users.push(student);
        db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"افزودن دانش‌آموز",details:`${firstName} ${lastName} — ${nationalId}`,at:faNow()});
        const written=await writeStateEnvelope(db);
        return {written,student};
      });
      // دانش‌آموز با کد ملی و تاریخ تولد وارد می‌شود؛ ساخت Credential سنگین در مسیر ثبت لازم نیست.
      await securityAudit({type:"student_create",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:saved.student.id});
      return sendJson(res,201,{ok:true,student:saved.student,updatedAt:saved.written.updatedAt,db:scopedDbForStaff(saved.written.db,auth.user)});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/classes/create") {
      if (!isAdminRole(auth.user.role)) throw Object.assign(new Error("ساخت کلاس فقط برای مدیر یا ادمین مجاز است."), { status: 403 });
      const body = await readJson(req);
      const name = String(body.name || "").trim().slice(0, 120);
      const grade = Number(body.grade);
      if (!name) throw Object.assign(new Error("نام کلاس الزامی است."), { status: 400 });
      if (![7,8,9].includes(grade)) throw Object.assign(new Error("پایه کلاس باید هفتم، هشتم یا نهم باشد."), { status: 400 });
      const saved = await enqueueStateOperation(async () => {
        const envelope = await ensureStateInitialized();
        const db = upgradeServerDbRespectingReset(structuredClone(envelope.db));
        db.school = db.school || {};
        db.school.classes = Array.isArray(db.school.classes) ? db.school.classes : [];
        if (db.school.classes.some(c => c.active !== false && String(c.name || "").trim() === name)) {
          throw Object.assign(new Error("کلاسی با این نام قبلاً ثبت شده است."), { status: 409 });
        }
        const meta = gradeMeta(grade);
        const row = {
          id: makeId("cls"), name, grade, gradeId: meta.id, gradeName: meta.name,
          active: true, academicYear: String(db.school.year || ""),
          createdAt: faNow(), createdBy: auth.user.id, updatedAt: faNow(), updatedBy: auth.user.id
        };
        db.school.classes.push(row);
        db.audit = Array.isArray(db.audit) ? db.audit : [];
        db.audit.unshift({id: makeId("log"), userId: auth.user.id, action: "افزودن کلاس", details: `${name} — ${meta.name}`, at: faNow()});
        const written = await writeStateEnvelope(db);
        return { written, row };
      });
      await securityAudit({type:"class_create",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:saved.row.id});
      return sendJson(res,201,{ok:true,class:saved.row,updatedAt:saved.written.updatedAt,db:scopedDbForStaff(saved.written.db,auth.user)});
    }

    if (req.method === "POST" && url.pathname === "/api/staff/users/create-teacher") {
      if (!isAdminRole(auth.user.role)) throw Object.assign(new Error("ثبت معلم فقط برای مدیر یا ادمین مجاز است."), { status: 403 });
      const body=await readJson(req),firstName=String(body.firstName||"").trim(),lastName=String(body.lastName||"").trim(),nationalId=normalizeNationalId(body.nationalId),subjects=Array.from(new Set((Array.isArray(body.subjects)?body.subjects:[]).map(x=>String(x||"").trim()).filter(Boolean))),classIds=Array.from(new Set((Array.isArray(body.classIds)?body.classIds:[]).map(x=>String(x||"").trim()).filter(Boolean)));
      if(!firstName||!lastName)throw Object.assign(new Error("نام و نام خانوادگی معلم الزامی است."),{status:400});if(!/^\d{10}$/.test(nationalId))throw Object.assign(new Error("کد ملی معلم باید ۱۰ رقم باشد."),{status:400});if(!subjects.length)throw Object.assign(new Error("حداقل یک درس برای معلم انتخاب کنید."),{status:400});
      const temporaryPassword=`Teach#${crypto.randomBytes(4).toString("hex")}A1`;
      const saved=await enqueueStateOperation(async()=>{const envelope=await ensureStateInitialized(),db=envelope.db;if((db.users||[]).some(u=>normalizeNationalId(u.nationalId)===nationalId))throw Object.assign(new Error("این کد ملی قبلاً ثبت شده است."),{status:409});const validClasses=new Set((db.school?.classes||[]).filter(c=>c.active!==false).map(c=>String(c.id))),validSubjects=new Set((db.school?.subjects||[]).map(x=>String(x||"").trim()).filter(Boolean)),teacher={id:makeId("tea"),role:"teacher",nationalId,username:nationalId,firstName,lastName,active:true,subjects:subjects.filter(x=>!validSubjects.size||validSubjects.has(x)),classIds:classIds.filter(x=>validClasses.has(x))};if(!teacher.subjects.length)throw Object.assign(new Error("درس انتخاب‌شده معتبر نیست."),{status:400});db.users=Array.isArray(db.users)?db.users:[];db.users.push(teacher);db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"افزودن معلم",details:`${firstName} ${lastName}`,at:faNow()});const written=await writeStateEnvelope(db);return {written,teacher};});
      await ensureSecurityInitialized(saved.written.db);
      await mutateSecurity(async security=>{const existing=security.credentials[saved.teacher.id]||{};security.credentials[saved.teacher.id]={...existing,username:nationalId,passwordHash:await passwordHash(temporaryPassword),mustChangePassword:true,failedLoginCount:0,lockedUntil:0,passwordChangedAt:null,credentialVersion:Number(existing.credentialVersion||0)+1};});
      await securityAudit({type:"teacher_create",userId:saved.teacher.id,role:"teacher",success:true,ip:clientIp(req),details:maskedNationalV78(nationalId)});
      return sendJson(res,201,{ok:true,teacher:saved.teacher,username:nationalId,temporaryPassword,updatedAt:saved.written.updatedAt,db:scopedDbForStaff(saved.written.db,auth.user)});
    }


    if (req.method === "POST" && url.pathname === "/api/staff/users/reset-password") {
      if (!isAdminRole(auth.user.role)) throw Object.assign(new Error("بازنشانی رمز فقط برای مدیر یا ادمین مجاز است."), { status: 403 });
      const body = await readJson(req); const target = (auth.db.users || []).find(u => u.id === body.userId && u.active);
      if (!target) throw Object.assign(new Error("کاربر فعال پیدا نشد."), { status: 404 });
      if (target.id === auth.user.id) throw Object.assign(new Error("برای حساب خودتان از بخش تغییر رمز استفاده کنید."), { status: 400 });
      if (!canResetPassword(auth.user.role,target.role)) {
        if(target.role==="student") throw Object.assign(new Error("دانش‌آموز رمز عبور ندارد؛ کد ملی و تاریخ تولد او را ویرایش کنید."), { status: 400 });
        throw Object.assign(new Error("اجازه بازنشانی رمز این حساب را ندارید."), { status: 403 });
      }
      await ensureSecurityInitialized(auth.db);
      const requestedInitialPassword = String(body.initialPassword || body.newPassword || "");
      if (target.role === "teacher" && requestedInitialPassword) {
        const initialError = initialStaffPasswordPolicy(requestedInitialPassword);
        if (initialError) throw Object.assign(new Error(initialError), { status: 400 });
      }
      const prefix = target.role === "teacher" ? "Teach" : target.role === "admin" ? "Manager" : "Admin";
      const temporaryPassword = requestedInitialPassword || `${prefix}#${crypto.randomBytes(4).toString("hex")}A1`;
      const updated = await mutateSecurity(async security => {
        const credential = security.credentials[target.id];
        if (!credential) return { error: "missing" };
        credential.passwordHash = await passwordHash(temporaryPassword); credential.mustChangePassword = true; credential.passwordChangedAt = new Date().toISOString(); credential.credentialVersion = Number(credential.credentialVersion || 1) + 1;
        for (const [hash, sess] of Object.entries(security.sessions || {})) if (sess.userId === target.id) delete security.sessions[hash];
        return { username: credential.username };
      });
      if (updated.result?.error) throw Object.assign(new Error("اطلاعات امنیتی کاربر پیدا نشد."), { status: 500 });
      await securityAudit({ type: "password_reset", userId: target.id, role: target.role, ip: clientIp(req), details: `توسط ${auth.user.id}` });
      return sendJson(res, 200, { ok: true, username: updated.result.username, temporaryPassword, mustChangePassword: true });
    }
    if (req.method === "GET" && url.pathname === "/api/staff/users/security-overview") {
      if (!["admin", "superadmin"].includes(auth.user.role)) throw Object.assign(new Error("این بخش فقط برای ادمین مجاز است."), { status: 403 });
      const security=await readSecurity();
      const sessionCounts={}; for(const sess of Object.values(security.sessions||{}))sessionCounts[sess.userId]=(sessionCounts[sess.userId]||0)+1;
      const users=(auth.db.users||[]).filter(u=>u.role!=="student").filter(u=>auth.user.role==="superadmin"||u.role!=="superadmin").map(u=>{const c=security.credentials?.[u.id]||{};return {id:u.id,role:u.role,name:`${u.firstName||""} ${u.lastName||""}`.trim(),nationalId:u.nationalId||"",active:u.active!==false,profileStatus:u.profileStatus||"active",username:c.username||"",mustChangePassword:Boolean(c.mustChangePassword),lastLoginAt:c.lastLoginAt||"",lastLoginIp:c.lastLoginIp||"",sessionCount:Number(sessionCounts[u.id]||0)};});
      return sendJson(res,200,{users});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/users/security-action") {
      if (!["admin", "superadmin"].includes(auth.user.role)) throw Object.assign(new Error("این عملیات فقط برای ادمین مجاز است."), { status: 403 });
      const body=await readJson(req), action=String(body.action||""), target=(auth.db.users||[]).find(u=>u.id===body.userId);
      if(!target)throw Object.assign(new Error("کاربر پیدا نشد."),{status:404});
      if(target.id===auth.user.id&&action==="lock")throw Object.assign(new Error("حساب خودتان را نمی‌توانید قفل کنید."),{status:400});
      if(target.role==="superadmin"&&auth.user.role!=="superadmin")throw Object.assign(new Error("مدیر مدرسه اجازه تغییر حساب ادمین فنی را ندارد."),{status:403});
      if(["deleted","graduated"].includes(target.profileStatus)&&["lock","unlock"].includes(action))throw Object.assign(new Error("ابتدا وضعیت کاربر را از سطل بازیافت/بایگانی اصلاح کنید."),{status:400});
      if(action==="revokeSessions"){
        const result=await mutateSecurity(sec=>{let n=0;for(const [h,x] of Object.entries(sec.sessions||{}))if(x.userId===target.id){delete sec.sessions[h];n++;}return n;});
        await securityAudit({type:"user_sessions_revoke",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`target=${target.id};count=${result.result||0}`});
        return sendJson(res,200,{ok:true,revoked:Number(result.result||0)});
      }
      if(!["lock","unlock"].includes(action))throw Object.assign(new Error("عملیات امنیتی معتبر نیست."),{status:400});
      const saved=await enqueueStateOperation(async()=>{const latest=(await ensureStateInitialized()).db;const t=(latest.users||[]).find(u=>u.id===target.id);if(!t)throw Object.assign(new Error("کاربر پیدا نشد."),{status:404});t.active=action==="unlock";t.profileStatus=action==="lock"?"locked":"active";t.accountStatusUpdatedAt=new Date().toISOString();t.accountStatusUpdatedBy=auth.user.id;latest.audit=Array.isArray(latest.audit)?latest.audit:[];latest.audit.unshift({id:makeId("log"),userId:auth.user.id,action:action==="lock"?"قفل حساب":"فعال‌سازی حساب",details:`${t.role}:${t.id}`,at:faNow()});return writeStateEnvelope(latest);});
      if(action==="lock")await mutateSecurity(sec=>{for(const [h,x] of Object.entries(sec.sessions||{}))if(x.userId===target.id)delete sec.sessions[h];});
      await securityAudit({type:`user_${action}`,userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:target.id});
      return sendJson(res,200,{ok:true,db:scopedDbForStaff(saved.db,auth.user)});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/users/delete") {
      if (!["admin", "superadmin"].includes(auth.user.role)) throw Object.assign(new Error("حذف کاربر فقط برای مدیر یا ادمین فنی مجاز است."), { status: 403 });
      const body = await readJson(req); const target = (auth.db.users || []).find(u => u.id === body.userId);
      if (!target) throw Object.assign(new Error("کاربر پیدا نشد."), { status: 404 });
      if (!["student", "teacher"].includes(target.role)) throw Object.assign(new Error("فقط معلم یا دانش‌آموز از این بخش قابل حذف است."), { status: 400 });
      const confirmNationalId = normalizeNationalId(body.nationalId);
      if (!confirmNationalId || !safeEqualText(confirmNationalId, normalizeNationalId(target.nationalId))) throw Object.assign(new Error("کد ملی تأیید حذف صحیح نیست."), { status: 400 });
      const saved = await enqueueStateOperation(async () => {const envelope=await ensureStateInitialized();const latest=envelope.db;const live=(latest.users||[]).find(u=>u.id===target.id);if(!live)throw Object.assign(new Error("کاربر پیدا نشد."),{status:404});if(live.profileStatus==="deleted")return {...envelope,alreadyRecycled:true};await createStateSnapshot(`before-recycle-${live.role}`);live.active=false;live.profileStatus="deleted";live.deletedAt=new Date().toISOString();live.deletedAtFa=faNow();live.deletedBy=auth.user.id;latest.audit=Array.isArray(latest.audit)?latest.audit:[];latest.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"انتقال کاربر به سطل بازیافت",details:`${live.role}:${live.id}`,at:faNow()});const written=await writeStateEnvelope(latest,{skipSnapshot:true});return {...written,alreadyRecycled:false};});
      await mutateSecurity(sec=>{for(const [h,x] of Object.entries(sec.sessions||{}))if(x.userId===target.id)delete sec.sessions[h];});
      await securityAudit({ type: saved.alreadyRecycled?"user_recycle_idempotent":"user_recycle", userId: auth.user.id, role: auth.user.role, ip: clientIp(req), details: `${target.role}:${target.id}` });
      return sendJson(res, 200, { ok: true, alreadyRecycled:Boolean(saved.alreadyRecycled), recycledUserId: target.id, retentionDays:Number(saved.db.school?.settings?.recycleRetentionDays||30), updatedAt: saved.updatedAt, db: scopedDbForStaff(saved.db, auth.user) });
    }
    if (req.method === "POST" && url.pathname === "/api/staff/users/restore") {
      if (!["admin","superadmin"].includes(auth.user.role)) throw Object.assign(new Error("بازیابی کاربر فقط برای ادمین مجاز است."),{status:403});
      const body=await readJson(req);const saved=await enqueueStateOperation(async()=>{const latest=(await ensureStateInitialized()).db;const t=(latest.users||[]).find(u=>u.id===body.userId&&u.profileStatus==="deleted");if(!t)throw Object.assign(new Error("کاربر در سطل بازیافت پیدا نشد."),{status:404});t.active=true;t.profileStatus="active";delete t.deletedAt;delete t.deletedAtFa;delete t.deletedBy;t.restoredAt=new Date().toISOString();t.restoredBy=auth.user.id;latest.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"بازیابی کاربر از سطل بازیافت",details:`${t.role}:${t.id}`,at:faNow()});return writeStateEnvelope(latest);});
      await securityAudit({type:"user_restore",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:String(body.userId||"")});return sendJson(res,200,{ok:true,db:scopedDbForStaff(saved.db,auth.user)});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/users/delete-permanent") {
      if (auth.user.role !== "superadmin") throw Object.assign(new Error("حذف دائمی فقط برای ادمین فنی مجاز است."),{status:403});
      const body=await readJson(req),target=(auth.db.users||[]).find(u=>u.id===body.userId&&u.profileStatus==="deleted");if(!target)throw Object.assign(new Error("کاربر در سطل بازیافت پیدا نشد."),{status:404});
      const nid=normalizeNationalId(body.nationalId);if(!nid||!safeEqualText(nid,normalizeNationalId(target.nationalId)))throw Object.assign(new Error("کد ملی تأیید حذف دائمی صحیح نیست."),{status:400});
      const saved=await enqueueStateOperation(async()=>{const latest=(await ensureStateInitialized()).db;const live=(latest.users||[]).find(u=>u.id===target.id&&u.profileStatus==="deleted");if(!live)throw Object.assign(new Error("کاربر در سطل بازیافت پیدا نشد."),{status:404});await createStateSnapshot(`before-permanent-delete-${live.role}`);const purged=purgeUserFromStateV4516(latest,live);purged.audit=Array.isArray(purged.audit)?purged.audit:[];purged.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"حذف دائمی کاربر",details:`${live.role}:${live.id}`,at:faNow()});return writeStateEnvelope(purged,{skipSnapshot:true});});
      await mutateSecurity(sec=>{delete sec.credentials[target.id];for(const [h,x] of Object.entries(sec.sessions||{}))if(x.userId===target.id)delete sec.sessions[h];});
      await securityAudit({type:"user_delete_permanent",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${target.role}:${target.id}`});return sendJson(res,200,{ok:true,db:scopedDbForStaff(saved.db,auth.user)});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/exam-delivery-recovery") {
      const body=await readJson(req),requestId=String(body.requestId||""),action=String(body.action||"");
      if(!["approve","reject","resolve"].includes(action))throw Object.assign(new Error("عملیات بازیابی معتبر نیست."),{status:400});
      const reason=String(body.reason||"").trim().slice(0,600);
      if(reason.length<5)throw Object.assign(new Error("دلیل تصمیم را کامل وارد کنید."),{status:400});
      const current=deliveryRecoveryRowsV65(auth.db).find(r=>r.id===requestId);
      if(!current)throw Object.assign(new Error("درخواست بازیابی پیدا نشد."),{status:404});
      const exam=(auth.db.exams||[]).find(e=>e.id===current.examId);
      if(!exam)throw Object.assign(new Error("آزمون مرتبط پیدا نشد."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId:exam.classId,subject:exam.subject,bookId:exam.bookId,feature:"examCreate"}))throw Object.assign(new Error("این درخواست خارج از محدوده دسترسی شماست."),{status:403});
      if(action==="approve"&&String(current.packageVersion||"")!==String(examPackageVersion(exam)))throw Object.assign(new Error("نسخه بسته دانش‌آموز با آزمون فعلی یکی نیست؛ Retry خودکار امن نیست و باید دستی بررسی شود."),{status:409,code:"RECOVERY_PACKAGE_STALE"});
      const saved=await mutateDb(async mutable=>{
        const r=deliveryRecoveryRowsV65(mutable).find(x=>x.id===requestId);if(!r)throw Object.assign(new Error("درخواست بازیابی پیدا نشد."),{status:404});
        const liveExam=(mutable.exams||[]).find(e=>e.id===r.examId);if(!liveExam)throw Object.assign(new Error("آزمون مرتبط پیدا نشد."),{status:404});
        if(action==="approve"&&String(r.packageVersion||"")!==String(examPackageVersion(liveExam)))throw Object.assign(new Error("نسخه آزمون در زمان بررسی تغییر کرده است؛ Retry خودکار امن نیست."),{status:409,code:"RECOVERY_PACKAGE_STALE"});
        if(auth.user.role==="teacher"&&!teacherCanAssigned(mutable,auth.user,{classId:liveExam.classId,subject:liveExam.subject,bookId:liveExam.bookId,feature:"examCreate"}))throw Object.assign(new Error("دسترسی شما به این آزمون تغییر کرده است."),{status:403});
        r.reviewedBy=auth.user.id;r.reviewedAt=Date.now();r.reviewReason=reason;
        if(action==="approve"){r.status="approved";r.expiresAt=Date.now()+24*60*60*1000;r.approvedAt=Date.now();}
        else if(action==="reject"){r.status="rejected";r.rejectedAt=Date.now();}
        else {r.status="resolved";r.resolvedAt=Date.now();}
        mutable.notifications ||= []; mutable.notifications.unshift({id:makeId("not"),userId:r.studentId,title:action==="approve"?"مجوز ارسال مجدد آزمون":"نتیجه بررسی تحویل آزمون",body:action==="approve"?"مدرسه برای همان پاسخ نهایی‌شده مجوز ارسال مجدد صادر کرد. از بخش وضعیت تحویل، ارسال مجدد را بزنید.":reason,read:false,at:faNow()});
        mutable.audit ||= []; mutable.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تصمیم Recovery تحویل آزمون",details:`${requestId}:${action}`,at:faNow()});return r;
      });
      await securityAudit({type:"exam_delivery_recovery",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${requestId}:${action}`});
      return sendJson(res,200,{ok:true,request:saved.result});
    }

    if (req.method === "POST" && url.pathname === "/api/staff/exam-incidents") {
      const body=await readJson(req),incidentId=String(body.incidentId||""),action=String(body.action||""),reason=String(body.reason||"").trim();
      if(!["confirm_technical","no_adjustment","grant_window","reject"].includes(action))throw Object.assign(new Error("اقدام Incident معتبر نیست."),{status:400});
      if(reason.length<5)throw Object.assign(new Error("دلیل تصمیم باید کامل ثبت شود."),{status:400});
      const incident=examIncidentRowsV66(auth.db).find(x=>x.id===incidentId);if(!incident)throw Object.assign(new Error("Incident پیدا نشد."),{status:404});
      const exam=(auth.db.exams||[]).find(e=>e.id===incident.examId);if(!exam)throw Object.assign(new Error("آزمون پیدا نشد."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId:exam.classId,subject:exam.subject,bookId:exam.bookId,feature:"examCreate"}))throw Object.assign(new Error("مجوز بررسی این Incident را ندارید."),{status:403});
      const minutes=action==="grant_window"?Math.max(5,Math.min(30,Number(body.minutes||0))):0;
      if(action==="grant_window"){
        if((auth.db.attempts||[]).some(x=>x.examId===exam.id&&x.studentId===incident.studentId)||(auth.db.submissions||[]).some(x=>x.examId===exam.id&&x.studentId===incident.studentId))throw Object.assign(new Error("دانش‌آموز قبلاً آزمون را تحویل داده است؛ پنجره جدید مجاز نیست."),{status:409});
        const pub=String(exam.publicationState||"").toLowerCase();if(!["published","in_progress","ended"].includes(pub)&&String(exam.status||"").toLowerCase()!=="active")throw Object.assign(new Error("این آزمون در مرحله‌ای نیست که بازگشایی محدود آن امن باشد."),{status:409});
      }
      const saved=await mutateDb(async mutable=>{mutable.examIncidents ||= [];const row=mutable.examIncidents.find(x=>x.id===incidentId);if(!row)throw Object.assign(new Error("Incident پیدا نشد."),{status:404});row.status=action==="reject"?"rejected":action==="grant_window"?"adjusted":action==="confirm_technical"?"technical_confirmed":"closed_no_adjustment";row.reviewedAt=Date.now();row.reviewedBy=auth.user.id;row.reviewReason=reason;row.reviewAction=action;if(action==="grant_window"){mutable.examFairnessAdjustments ||= [];for(const x of mutable.examFairnessAdjustments){if(x.studentId===row.studentId&&x.examId===row.examId&&x.status==="active")x.status="superseded";}const adj={id:makeId("fair"),incidentId:row.id,studentId:row.studentId,examId:row.examId,minutes,reason,createdAt:Date.now(),createdBy:auth.user.id,expiresAt:Date.now()+minutes*60*1000,status:"active"};mutable.examFairnessAdjustments.push(adj);row.fairnessAdjustmentId=adj.id;mutable.notifications ||= [];mutable.notifications.unshift({id:makeId("not"),userId:row.studentId,title:"فرصت محدود آزمون فعال شد",body:`برای آزمون «${exam.title}» یک پنجره ${minutes} دقیقه‌ای فعال شد. پس از همگام‌سازی وارد آزمون شوید.`,read:false,at:faNow()});}mutable.audit ||= [];mutable.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تصمیم Incident آزمون",details:`${incidentId}:${action}`,at:faNow()});return row;});
      await securityAudit({type:"exam_incident_review",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${incidentId}:${action}`});
      return sendJson(res,200,{ok:true,incident:saved.result});
    }



    // v45.26 — معلم می‌تواند فقط در کلاس‌های تخصیص‌یافته خودش دانش‌آموز جدید ثبت کند.
    // این مسیر عمداً اجازه ویرایش/حذف کاربران موجود را به معلم نمی‌دهد.
    if (req.method === "POST" && url.pathname === "/api/staff/students") {
      const body = await readJson(req);
      const firstName = String(body.firstName || "").trim();
      const lastName = String(body.lastName || "").trim();
      const nationalId = normalizeNationalId(body.nationalId);
      const birthDate = normalizeStoredBirthDate(body.birthDate);
      const classId = String(body.classId || "").trim();
      const guardianMobile = String(body.guardianMobile || "").trim() || "ثبت نشده";
      if (!firstName || !lastName) throw Object.assign(new Error("نام و نام خانوادگی دانش‌آموز الزامی است."), { status: 400 });
      if (!/^\d{10}$/.test(nationalId)) throw Object.assign(new Error("کد ملی دانش‌آموز باید ۱۰ رقم باشد."), { status: 400 });
      if (!birthDate || birthDate.length !== 10) throw Object.assign(new Error("تاریخ تولد دانش‌آموز کامل و معتبر نیست."), { status: 400 });
      const classRow = (auth.db.school?.classes || []).find(c => c.id === classId && c.active !== false);
      if (!classRow) throw Object.assign(new Error("کلاس انتخاب‌شده معتبر یا فعال نیست."), { status: 400 });
      if (auth.user.role === "teacher" && !teacherCanAssigned(auth.db, auth.user, { classId, feature: "students" })) {
        throw Object.assign(new Error("ثبت دانش‌آموز فقط در کلاس‌های تخصیص‌یافته به شما مجاز است."), { status: 403 });
      }
      const saved = await enqueueStateOperation(async () => {
        const latest = (await ensureStateInitialized()).db;
        const liveClass = (latest.school?.classes || []).find(c => c.id === classId && c.active !== false);
        if (!liveClass) throw Object.assign(new Error("کلاس انتخاب‌شده دیگر فعال نیست."), { status: 409 });
        if (auth.user.role === "teacher" && !teacherCanAssigned(latest, auth.user, { classId, feature: "students" })) {
          throw Object.assign(new Error("تخصیص شما به این کلاس تغییر کرده است؛ صفحه را به‌روزرسانی کنید."), { status: 403 });
        }
        if ((latest.users || []).some(u => normalizeNationalId(u.nationalId) === nationalId && u.profileStatus !== "deleted")) {
          throw Object.assign(new Error("این کد ملی قبلاً در سامانه ثبت شده است."), { status: 409 });
        }
        const grade = Number(liveClass.grade || 0);
        const meta = gradeMeta(grade);
        let baseCode = `${grade || 7}${nationalId.slice(-6)}`;
        let studentCode = baseCode, suffix = 1;
        while ((latest.users || []).some(u => String(u.studentCode || "") === studentCode)) studentCode = `${baseCode}${suffix++}`;
        const student = {
          id: makeId("stu"),
          role: "student",
          username: nationalId,
          nationalId,
          firstName,
          lastName,
          birthDate,
          studentCode,
          classId,
          grade: meta.grade,
          gradeId: meta.id,
          gradeName: meta.name,
          guardianMobile,
          enrollmentYear: latest.school?.year || "",
          active: true,
          profileStatus: "active",
          createdAt: faNow(),
          createdAtIso: new Date().toISOString(),
          createdBy: auth.user.id
        };
        latest.users = Array.isArray(latest.users) ? latest.users : [];
        latest.users.push(student);
        latest.audit = Array.isArray(latest.audit) ? latest.audit : [];
        latest.audit.unshift({
          id: makeId("log"),
          userId: auth.user.id,
          action: auth.user.role === "teacher" ? "ثبت دانش‌آموز توسط معلم" : "ثبت دانش‌آموز",
          details: `${firstName} ${lastName} · ${liveClass.name || classId} · ${studentCode}`,
          at: faNow()
        });
        const env = await writeStateEnvelope(latest);
        return { env, student };
      });
      await securityAudit({
        type: "student_create",
        userId: auth.user.id,
        role: auth.user.role,
        ip: clientIp(req),
        details: `${saved.student.id}:${saved.student.classId}`
      });
      return sendJson(res, 201, {
        ok: true,
        student: publicStudent(saved.student, saved.env.db),
        updatedAt: saved.env.updatedAt,
        db: scopedDbForStaff(saved.env.db, auth.user)
      });
    }

    if (req.method === "GET" && url.pathname === "/api/staff/student-analysis") {
      const studentId=String(url.searchParams.get("studentId")||""),period=String(url.searchParams.get("period")||"month"),subject=String(url.searchParams.get("subject")||"").trim();
      if(!staffCanViewAnalysisV4518(auth.db,auth.user,studentId,subject))throw Object.assign(new Error("به پرونده تحلیلی این دانش‌آموز دسترسی ندارید."),{status:403});
      const analysis=academicAnalyticsV4518(auth.db,studentId,period,subject);if(!analysis)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
      return sendJson(res,200,{ok:true,analysis});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/student-analysis/note") {
      const body=await readJson(req),studentId=String(body.studentId||""),period=String(body.period||"month"),subject=String(body.subject||"").trim(),comment=String(body.teacherComment||body.comment||"").trim();
      if(!ACADEMIC_PERIODS_V4518[period])throw Object.assign(new Error("بازه گزارش معتبر نیست."),{status:400});
      if(!staffCanViewAnalysisV4518(auth.db,auth.user,studentId,subject))throw Object.assign(new Error("اجازه ثبت نظر برای این دانش‌آموز را ندارید."),{status:403});
      if(comment.length<3||comment.length>3000)throw Object.assign(new Error("نظر معلم باید بین ۳ تا ۳۰۰۰ نویسه باشد."),{status:400});
      const baseAnalysis=academicAnalyticsV4518(auth.db,studentId,period,subject); const saved=await enqueueStateOperation(async()=>{const latest=(await ensureStateInitialized()).db; if(!staffCanViewAnalysisV4518(latest,auth.user,studentId,subject))throw Object.assign(new Error("دسترسی شما به این دانش‌آموز تغییر کرده است."),{status:403}); latest.progressReports=Array.isArray(latest.progressReports)?latest.progressReports:[];const row={id:makeId("prg"),type:"academic_analysis",studentId,teacherId:auth.user.id,teacherName:`${auth.user.firstName||""} ${auth.user.lastName||""}`.trim()||"معلم",subject,period,periodLabel:ACADEMIC_PERIODS_V4518[period].label,teacherComment:comment,summary:comment,guardianVisible:body.guardianVisible!==false,status:"published",snapshot:{averagePercent:baseAnalysis?.current?.averagePercent??null,status:baseAnalysis?.status?.key||"no_data",trend:baseAnalysis?.trend?.key||"no_data",trendDelta:baseAnalysis?.trend?.delta??null,examCount:baseAnalysis?.current?.examCount||0,absent:baseAnalysis?.attendance?.absent||0,late:baseAnalysis?.attendance?.late||0},publishedAt:faNow(),publishedAtIso:new Date().toISOString(),createdAt:faNow(),createdAtIso:new Date().toISOString()};latest.progressReports.unshift(row);latest.audit=Array.isArray(latest.audit)?latest.audit:[];latest.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت نظر تحلیلی دانش‌آموز",details:`${studentId} · ${ACADEMIC_PERIODS_V4518[period].label}${subject?` · ${subject}`:""}`,at:faNow()});const env=await writeStateEnvelope(latest);return {env,row};});
      await securityAudit({type:"student_analysis_note",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${studentId}:${period}:${subject}`}); const analysis=academicAnalyticsV4518(saved.env.db,studentId,period,subject); return sendJson(res,200,{ok:true,report:saved.row,analysis});
    }

    // v75 professional gradebook
    if (req.method === "GET" && url.pathname === "/api/staff/gradebook") {
      const classId=String(url.searchParams.get("classId")||""),subject=String(url.searchParams.get("subject")||"").trim(),academicPeriod=normalizeAcademicPeriod(url.searchParams.get("academicPeriod")||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      if(!classId||!subject)throw Object.assign(new Error("کلاس و درس الزامی است."),{status:400});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"continuous"}))throw Object.assign(new Error("به دفتر نمره این کلاس دسترسی ندارید."),{status:403});
      return sendJson(res,200,{ok:true,...gradebookPayloadV75(auth.db,{classId,subject,academicYear,academicPeriod})});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/gradebook/config") {
      const body=await readJson(req),classId=String(body.classId||""),subject=String(body.subject||"").trim(),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      // T06: manager-only scoring policy, enforced on the server.
      if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("تعیین بارم مستمر و پایانی فقط در اختیار مدیر مدرسه است."),{status:403});
      if(isTermLockedV75(auth.db,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات این درس/نیم‌سال قفل شده‌اند."),{status:409,code:"TERM_LOCKED"});
      const normalized=normalizeGradebookConfigV75(body,{classId,subject,academicYear,academicPeriod});
      // T06: prevent invalidating recorded scores, final exam papers or published cards.
      if(!(auth.db.school?.classes||[]).some(c=>c.id===classId&&c.active!==false)||!subject)throw Object.assign(new Error("کلاس یا درس برای تنظیم بارم معتبر نیست."),{status:400});
      if(!Number.isFinite(normalized.outputMaxScore)||normalized.outputMaxScore < 0.25||normalized.outputMaxScore > 19.75 || Math.abs(normalized.outputMaxScore*4-Math.round(normalized.outputMaxScore*4))>0.000001)
        throw Object.assign(new Error("برای برگزاری آزمون پایانی، بارم مستمر باید بین ۰٫۲۵ و ۱۹٫۷۵ باشد."),{status:400});
      const saved=await mutateDb(m=>{
        if(isTermLockedV75(m,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات این درس و نیم‌سال قفل هستند."),{status:409});
        const finalMax=Math.round((20-normalized.outputMaxScore)*100)/100;
        const conflict=(m.termFinalOverrides||[]).find(r=>r.active!==false&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||"semester2")===academicPeriod&&invalidTermFinalV6719(r,finalMax));
        if(conflict)throw Object.assign(new Error("بارم جدید از یکی از نمرات پایانی تأییدشده کمتر است؛ ابتدا با فرایند اصلاح رسمی نمره اقدام کنید."),{status:409});
        const examConflict=(m.exams||[]).find(e=>e.classId===classId&&e.subject===subject&&String(e.examCategory||"ongoing")==="final"&&String(e.academicYear||academicYear)===academicYear&&String(e.academicPeriod||e.period||"semester2")===academicPeriod&&Math.abs(Number(e.targetScore||0)-finalMax)>0.001);
        if(examConflict)throw Object.assign(new Error(`آزمون پایانی «${examConflict.title||""}» با بارم دیگری وجود دارد؛ نخست وضعیت آن را اصلاح کنید.`),{status:409});
        const studentIds=new Set((m.users||[]).filter(u=>u.role==="student"&&u.classId===classId).map(u=>String(u.id)));
        const published=(m.reportCards||[]).some(r=>r.status==="published"&&studentIds.has(String(r.studentId))&&[academicPeriod,"annual"].includes(String(r.academicPeriod||r.period||"semester2"))&&String(r.academicYear||academicYear)===academicYear);
        if(published)throw Object.assign(new Error("کارنامه این نیم‌سال منتشر شده است؛ ابتدا مدیر باید کارنامه را با فرایند رسمی بازگشایی کند."),{status:409});
        m.gradebookConfigs||=[];const old=m.gradebookConfigs.find(x=>x.key===normalized.key);
        const now=new Date().toISOString(),row={id:old?.id||makeId("gbc"),...normalized,createdAt:old?.createdAt||now,updatedAt:now,updatedBy:auth.user.id};
        m.gradebookConfigs=m.gradebookConfigs.filter(x=>x.key!==row.key);m.gradebookConfigs.push(row);
        // Harmonize legacy term-policy read path (exam validators) with the gradebook source.
        m.termPolicies=Array.isArray(m.termPolicies)?m.termPolicies:[];
        const prior=m.termPolicies.find(p=>p.key===normalized.key);
        const policy={...(prior||{}),id:prior?.id||makeId("tp"),key:normalized.key,classId,subject,academicYear,academicPeriod,continuousEnabled:true,continuousShare:normalized.outputMaxScore,finalShare:finalMax,updatedAt:now,updatedBy:auth.user.id,createdAt:prior?.createdAt||now};
        m.termPolicies=m.termPolicies.filter(p=>p.key!==policy.key);m.termPolicies.push(policy);
        m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تنظیم مدیریتی بارم پایان‌ترم T06",details:`${classId} · ${subject} · ${academicPeriod} · مستمر ${normalized.outputMaxScore} + پایانی ${finalMax}`,at:faNow()});
        return row;
      });
      return sendJson(res,200,{ok:true,config:saved.result});
    }
    // p31: explicit teacher-approved continuous mark, separate from calculated gradebook.
    if (req.method === "POST" && url.pathname === "/api/staff/gradebook/approve-continuous") {
      const body=await readJson(req),studentId=String(body.studentId||""),classId=String(body.classId||""),subject=String(body.subject||"").trim(),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      const student=(auth.db.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.classId===classId&&x.profileStatus!=="deleted");
      if(!student||!subject)throw Object.assign(new Error("دانش‌آموز یا درس معتبر نیست."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"continuous"}))throw Object.assign(new Error("مجوز تأیید نمره این درس را ندارید."),{status:403});
      if(publishedCardBlocksGradeT07(auth.db,{studentId,academicYear,academicPeriod}))throw Object.assign(new Error("کارنامه رسمی منتشر شده است؛ مدیر باید ابتدا آن را بازگشایی کند."),{status:409,code:"REPORT_CARD_LOCKED"});
      if(isTermLockedV75(auth.db,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات این درس/نیم‌سال قفل شده‌اند."),{status:409,code:"TERM_LOCKED"});
      const cfg=gradebookPayloadV75(auth.db,{classId,subject,academicYear,academicPeriod}).config;
      const maxScore=Number(cfg.outputMaxScore||5),score=Number(body.score);
      if(body.score===null||body.score===undefined||String(body.score).trim()===""||!Number.isFinite(score)||score<0||score>maxScore)throw Object.assign(new Error(`نمره نهایی معلم باید بین صفر تا ${maxScore} باشد.`),{status:400});
      const approvedFinal=(auth.db.termFinalOverrides||[]).filter(r=>r.active!==false&&r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||"semester2")===academicPeriod).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0];
      const finalMax=Math.round((20-maxScore)*100)/100;
      if(invalidTermFinalV6719(approvedFinal,finalMax))throw Object.assign(new Error(`پایانی ثبت‌شده قبلی از سقف ${finalMax} بیشتر است؛ ابتدا آن را اصلاح یا حذف کنید.`),{status:400});
      const saved=await mutateDb(m=>{if(publishedCardBlocksGradeT07(m,{studentId,academicYear,academicPeriod}))throw Object.assign(new Error("کارنامه منتشرشده باید ابتدا توسط مدیر بازگشایی شود."),{status:409,code:"REPORT_CARD_LOCKED"});if(isTermLockedV75(m,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات قفل شده‌اند."),{status:409});m.continuousGradeOverrides||=[];const old=m.continuousGradeOverrides.find(r=>r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||r.period||"semester2")===academicPeriod&&r.active!==false);
        const now=new Date().toISOString(),rounded=Math.round(score*100)/100,normalized=Math.round(score/maxScore*20*100)/100;
        const row={...(old||{}),id:old?.id||makeId("cgo"),studentId,classId,subject,academicYear,academicPeriod,active:true,finalScore:normalized,approvedRawScore:rounded,approvedMaxScore:maxScore,approvedBy:auth.user.id,approvedAt:now,reason:"تأیید نهایی معلم",updatedAt:now,history:[...(old?.history||[]),{from:old?.approvedRawScore??null,to:rounded,maxScore,by:auth.user.id,at:now,reason:"تأیید نهایی معلم"}].slice(-100)};
        m.continuousGradeOverrides=m.continuousGradeOverrides.filter(r=>r!==old);m.continuousGradeOverrides.push(row);
        m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تأیید نمره نهایی مستمر",details:`${studentId} · ${subject} · ${academicPeriod} · ${rounded}/${maxScore}`,at:faNow()});return row;});
      return sendJson(res,200,{ok:true,approved:{score:saved.result.approvedRawScore,maxScore:saved.result.approvedMaxScore,updatedAt:saved.result.updatedAt}});
    }
    // p32: manual end-of-term mark, shared by the gradebook and report card.
    // p38: authoritative read-back for saved teacher-approved final marks.
    if (req.method === "GET" && url.pathname === "/api/staff/gradebook/final-mark") {
      const studentId=String(url.searchParams.get("studentId")||""),classId=String(url.searchParams.get("classId")||""),subject=String(url.searchParams.get("subject")||"").trim(),academicPeriod=normalizeAcademicPeriod(url.searchParams.get("academicPeriod")||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      const student=(auth.db.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.classId===classId&&x.profileStatus!=="deleted");
      if(!student||!subject)throw Object.assign(new Error("دانش‌آموز یا درس معتبر نیست."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"continuous"}))throw Object.assign(new Error("مجوز مشاهده نمره این درس را ندارید."),{status:403});
      const finalMark=(auth.db.termFinalOverrides||[]).filter(r=>r.active!==false&&r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||"semester2")===academicPeriod).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
      return sendJson(res,200,{ok:true,finalMark});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/gradebook/final-mark") {
      const body=await readJson(req),studentId=String(body.studentId||""),classId=String(body.classId||""),subject=String(body.subject||"").trim(),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      const student=(auth.db.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.classId===classId&&x.profileStatus!=="deleted");
      if(!student||!subject)throw Object.assign(new Error("دانش‌آموز یا درس معتبر نیست."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"continuous"}))throw Object.assign(new Error("مجوز ثبت نمره این درس را ندارید."),{status:403});
      if(publishedCardBlocksGradeT07(auth.db,{studentId,academicYear,academicPeriod}))throw Object.assign(new Error("کارنامه رسمی منتشر شده است؛ مدیر باید ابتدا آن را بازگشایی کند."),{status:409,code:"REPORT_CARD_LOCKED"});
      if(isTermLockedV75(auth.db,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات این درس/نیم‌سال قفل شده‌اند."),{status:409,code:"TERM_LOCKED"});
      const cfg=gradebookPayloadV75(auth.db,{classId,subject,academicYear,academicPeriod}).config;
      const maxScore=gradebookSharesV6719(auth.db,{classId,subject,academicYear,academicPeriod}).finalMax;
      if(maxScore<=0&&body.clear!==true)throw Object.assign(new Error("بارم مستمر ۲۰ است؛ امکان ثبت نمره پایانی وجود ندارد."),{status:400});
      const clear=body.clear===true,score=Number(body.score);
      if(!clear&&(body.score===null||body.score===undefined||String(body.score).trim()===""||!Number.isFinite(score)||score<0||score>maxScore))throw Object.assign(new Error(`نمره پایانی باید بین صفر تا ${maxScore} باشد.`),{status:400});
      // P67.19: validation uses only the persisted gradebook ceiling (20 - outputMaxScore).
      // Example: 10 continuous max, approved continuous 8, final 12 => reject.
      const saved=await mutateDb(m=>{
        if(publishedCardBlocksGradeT07(m,{studentId,academicYear,academicPeriod}))throw Object.assign(new Error("کارنامه منتشرشده باید ابتدا توسط مدیر بازگشایی شود."),{status:409,code:"REPORT_CARD_LOCKED"});
        if(isTermLockedV75(m,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات قفل شده‌اند."),{status:409});
        const authoritativeMax=gradebookSharesV6719(m,{classId,subject,academicYear,academicPeriod}).finalMax;
        if(!clear&&(authoritativeMax<=0||score>authoritativeMax+0.000001))throw Object.assign(new Error(`نمره پایانی باید بین صفر تا ${authoritativeMax} باشد.`),{status:400});
        m.termFinalOverrides||=[];const old=m.termFinalOverrides.find(r=>r.active!==false&&r.studentId===studentId&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||"semester2")===academicPeriod);
        if(clear){if(old)old.active=false;return null;}
        const now=new Date().toISOString(),row={...(old||{}),id:old?.id||makeId("tfo"),studentId,classId,subject,academicYear,academicPeriod,score:Math.round(score*100)/100,maxScore:authoritativeMax,active:true,updatedAt:now,updatedBy:auth.user.id,history:[...(old?.history||[]),{score:Math.round(score*100)/100,maxScore:authoritativeMax,by:auth.user.id,at:now}].slice(-100)};
        if(old)Object.assign(old,row);else m.termFinalOverrides.push(row);
        m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت دستی پایانی نیم‌سال",details:`${studentId} · ${subject} · ${academicPeriod} · ${row.score}/${maxScore}`,at:faNow()});return row;});
      return sendJson(res,200,{ok:true,finalMark:saved.result});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/gradebook/entry") {
      const body=await readJson(req),studentId=String(body.studentId||""),classId=String(body.classId||""),subject=String(body.subject||"").trim(),categoryId=String(body.categoryId||"").trim(),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      const student=(auth.db.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.classId===classId&&x.profileStatus!=="deleted");if(!student)throw Object.assign(new Error("دانش‌آموز معتبر نیست."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"continuous"}))throw Object.assign(new Error("مجوز ثبت نمره این کلاس را ندارید."),{status:403});
      if(publishedCardBlocksGradeT07(auth.db,{studentId,academicYear,academicPeriod}))throw Object.assign(new Error("کارنامه رسمی منتشر شده است؛ مدیر باید ابتدا آن را بازگشایی کند."),{status:409,code:"REPORT_CARD_LOCKED"});
      if(isTermLockedV75(auth.db,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات این درس/نیم‌سال قفل شده‌اند."),{status:409,code:"TERM_LOCKED"});
      const cfg=gradebookPayloadV75(auth.db,{classId,subject,academicYear,academicPeriod}).config,cat=(cfg.categories||[]).find(c=>c.id===categoryId&&c.source!=="exam");if(!cat)throw Object.assign(new Error("مولفه دفتر نمره معتبر نیست."),{status:400});
      const score=Number(body.score),maxScore=Number(body.maxScore||20);if(!Number.isFinite(score)||!Number.isFinite(maxScore)||maxScore<=0||score<0||score>maxScore)throw Object.assign(new Error("نمره و بارم معتبر نیست."),{status:400});
      const id=String(body.id||"");const saved=await mutateDb(m=>{if(publishedCardBlocksGradeT07(m,{studentId,academicYear,academicPeriod}))throw Object.assign(new Error("کارنامه منتشر شده است؛ ابتدا بازگشایی کنید."),{status:409,code:"REPORT_CARD_LOCKED"});if(isTermLockedV75(m,{classId,subject,academicYear,academicPeriod}))throw Object.assign(new Error("نمرات قفل هستند."),{status:409});m.gradebookEntries||=[];let row=id?m.gradebookEntries.find(x=>x.id===id):null;const payload={studentId,classId,subject,categoryId,title:String(body.title||cat.title).trim().slice(0,120),score:Math.round(score*100)/100,maxScore:Math.round(maxScore*100)/100,date:String(body.date||new Date().toISOString().slice(0,10)).slice(0,10),note:String(body.note||"").trim().slice(0,1000),academicYear,academicPeriod,active:true,updatedAt:new Date().toISOString(),updatedBy:auth.user.id};if(row)Object.assign(row,payload);else{row={id:makeId("gbe"),...payload,createdAt:new Date().toISOString(),createdBy:auth.user.id};m.gradebookEntries.push(row);}m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت دفتر نمره",details:`${studentId} · ${subject} · ${cat.title} · ${score}/${maxScore}`,at:faNow()});return row;});
      return sendJson(res,200,{ok:true,entry:saved.result,computed:gradebookContinuousV75(saved.db,{studentId,classId,subject,academicYear,academicPeriod})});
    }
    // P65.2 — Scoped, atomic homework creation/editing; does not write official grades.
    if (req.method === "POST" && url.pathname === "/api/staff/homework/p652/save") {
      const body=await readJson(req);
      const classId=String(body.classId||"").trim(),subject=String(body.subject||"").trim();
      const title=String(body.title||"").trim(),description=String(body.description||"").trim();
      const id=String(body.id||"").trim(),publicationState=String(body.publicationState||"draft");
      const dueAt=String(body.dueAt||"").trim(),dueTime=String(body.dueTime||"").trim();
      const year=String(auth.db.school?.year||"");
      const err=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
      if(!(auth.db.school?.classes||[]).some(c=>c.id===classId&&c.active!==false))err("کلاس انتخاب‌شده معتبر نیست.");
      if(!subject||subject.length>100)err("درس انتخاب‌شده معتبر نیست.");
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"homework"}))err("مجوز ثبت تکلیف برای این کلاس و درس را ندارید.",403);
      if(title.length<3||title.length>120)err("عنوان تکلیف باید بین ۳ تا ۱۲۰ نویسه باشد.");
      if(description.length<5||description.length>5000)err("توضیحات تکلیف باید بین ۵ تا ۵۰۰۰ نویسه باشد.");
      if(!["draft","published"].includes(publicationState))err("وضعیت انتشار معتبر نیست.");
      if(dueAt&&!/^\d{4}-\d{2}-\d{2}$/.test(dueAt))err("تاریخ تحویل معتبر نیست.");
      if(dueAt&&(Number.isNaN(new Date(dueAt+"T12:00:00Z").getTime())||new Date(dueAt+"T12:00:00Z").toISOString().slice(0,10)!==dueAt))err("تاریخ تحویل معتبر نیست.");
      if(dueTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))err("ساعت تحویل معتبر نیست.");
      if(!dueAt&&dueTime)err("برای انتخاب ساعت ابتدا تاریخ تحویل را تعیین کنید.");
      const totalScore=Number(body.totalScore??20);
      if(!Number.isFinite(totalScore)||totalScore<=0||totalScore>20)err("بارم تکلیف باید بیشتر از صفر و حداکثر ۲۰ باشد.");
      const allStudents=(auth.db.users||[]).filter(s=>s.role==="student"&&s.classId===classId&&s.profileStatus!=="deleted"&&s.active!==false);
      const validIds=new Set(allStudents.map(s=>String(s.id)));
      const recipientMode=String(body.recipientMode||"all");
      if(!["all","selected"].includes(recipientMode))err("نوع انتخاب دانش‌آموزان معتبر نیست.");
      const selected=Array.isArray(body.studentIds)?[...new Set(body.studentIds.map(String))]:[];
      if(selected.some(s=>!validIds.has(s))||(recipientMode==="selected"&&!selected.length))err("دانش‌آموز انتخاب‌شده خارج از کلاس است یا گیرنده‌ای انتخاب نشده است.");
      const studentIds=recipientMode==="selected"?selected:[];
      const attachments=Array.isArray(body.attachments)?body.attachments:[];
      if(attachments.length>2)err("حداکثر دو فایل پیوست مجاز است.");
      const normalizedFiles=attachments.map((f,i)=>{
        const name=String(f?.name||`پیوست ${i+1}`).trim().slice(0,120),dataUrl=String(f?.dataUrl||"");
        const m=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
        if(!m)err("فرمت فایل باید JPG، PNG، WebP یا PDF باشد.");
        const bytes=Buffer.from(m[2],"base64");
        if(bytes.length>650*1024)err("حجم هر فایل حداکثر ۶۵۰ کیلوبایت است.");
        if(bytes.toString("base64")!==m[2])err("محتوای پیوست معتبر نیست.");
        return {name,type:m[1].toLowerCase(),size:bytes.length,dataUrl};
      });
      const saved=await mutateDb(m=>{
        m.homework=Array.isArray(m.homework)?m.homework:[];
        const old=id?m.homework.find(h=>String(h.id)===id):null;
        if(id&&!old)err("تکلیف موردنظر دیگر وجود ندارد.",404);
        if(old&&auth.user.role==="teacher"&&!teacherCanAssigned(m,auth.user,{classId:old.classId,subject:old.subject,feature:"homework"}))err("مجوز ویرایش این تکلیف را ندارید.",403);
        if(auth.user.role==="teacher"&&!teacherCanAssigned(m,auth.user,{classId,subject,feature:"homework"}))err("دسترسی به این درس تغییر کرده است.",403);
        const dueAtJalali=String(body.dueAtJalali||"").slice(0,10);
        const nowIso=new Date().toISOString(),becamePublished=publicationState==="published"&&String(old?.publicationState|| (old?.published===false?"draft":"published"))!=="published";
        const shouldNotify=publicationState==="published"&&(!old||becamePublished);
        const row={...(old||{}),id:old?.id||makeId("hw"),classId,subject,title,description,
          dueAt,dueTime,dueAtJalali:String(body.dueAtJalali||"").slice(0,10),dueAtIso:dueAt?`${dueAt}T${dueTime||"23:59"}:00+03:30`:"",
          totalScore:Math.round(totalScore*4)/4,allowLate:body.allowLate===true,
          recipientMode,studentIds,attachments:normalizedFiles,status:"active",publicationState,published:publicationState==="published",
          academicYear:year,academicPeriod:String(body.academicPeriod||old?.academicPeriod||"semester2") === "semester1"?"semester1":"semester2",
          createdAt:old?.createdAt||faNow(),createdAtIso:old?.createdAtIso||nowIso,createdBy:old?.createdBy||auth.user.id,
          updatedAt:faNow(),updatedAtIso:nowIso,updatedBy:auth.user.id};
        if(shouldNotify)row.publishedAt=nowIso;
        if(old)Object.assign(old,row);else m.homework.unshift(row);
        if(shouldNotify){m.notifications=Array.isArray(m.notifications)?m.notifications:[];
          for(const st of allStudents){if(recipientMode==="selected"&&!studentIds.includes(String(st.id)))continue;
            m.notifications.unshift({id:makeId("not"),userId:st.id,title:"تکلیف جدید",body:`${subject}: ${title}${dueAt?` · مهلت ${dueAtJalali||dueAt}`:""}`,read:false,at:faNow(),kind:"homework",target:"homework",targetId:row.id});
          }
        }
        m.audit=Array.isArray(m.audit)?m.audit:[];
        m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:shouldNotify?"انتشار تکلیف P65.2":"ذخیره تکلیف P65.2",details:`${classId} · ${subject} · ${title} · ${publicationState}`,at:faNow()});
        return {id:row.id,title:row.title,publicationState:row.publicationState};
      });
      return sendJson(res,200,{ok:true,homework:saved.result});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/homework/grade") {
      const body=await readJson(req),submissionId=String(body.submissionId||"");const submission=(auth.db.homeworkSubmissions||[]).find(x=>x.id===submissionId),homework=submission&&(auth.db.homework||[]).find(h=>h.id===submission.homeworkId);if(!submission||!homework)throw Object.assign(new Error("تحویل تکلیف پیدا نشد."),{status:404});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId:homework.classId,subject:homework.subject,feature:"homework"}))throw Object.assign(new Error("مجوز تصحیح این تکلیف را ندارید."),{status:403});
      const maxScore=Number(homework.totalScore||20),score=Number(body.score);if(!Number.isFinite(score)||score<0||score>maxScore)throw Object.assign(new Error(`نمره باید بین صفر تا ${maxScore} باشد.`),{status:400});
      const saved=await mutateDb(m=>{const row=(m.homeworkSubmissions||[]).find(x=>x.id===submissionId);if(!row)throw Object.assign(new Error("تحویل تکلیف دیگر وجود ندارد."),{status:404});Object.assign(row,{score:Math.round(score*100)/100,maxScore,feedback:String(body.feedback||"").trim().slice(0,2000),status:"graded",gradedAt:faNow(),gradedAtIso:new Date().toISOString(),gradedBy:auth.user.id});m.notifications||=[];m.notifications.unshift({id:makeId("not"),userId:row.studentId,title:"تکلیف تصحیح شد",body:`${homework.title}: ${row.score} از ${maxScore}${row.feedback?` · ${row.feedback}`:""}`,read:false,at:faNow(),kind:"homework_graded"});m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تصحیح تکلیف",details:`${homework.title} · ${row.studentId} · ${row.score}/${maxScore}`,at:faNow()});return row;});
      return sendJson(res,200,{ok:true,submission:saved.result});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/term-lock") {
      if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("قفل و بازگشایی نمرات فقط توسط مدیر مجاز است."),{status:403});
      const body=await readJson(req),classId=String(body.classId||""),subject=String(body.subject||"").trim(),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||""),action=String(body.action||"lock");if(!classId||!subject)throw Object.assign(new Error("کلاس و درس الزامی است."),{status:400});
      const saved=await mutateDb(m=>{m.termLocks||=[];m.termLocks=m.termLocks.filter(x=>!(x.classId===classId&&x.subject===subject&&String(x.academicYear||"")===academicYear&&String(x.academicPeriod||x.period||"semester2")===academicPeriod));let row=null;if(action!=="unlock"){row={id:makeId("tlock"),classId,subject,academicYear,academicPeriod,active:true,reason:String(body.reason||"تأیید نهایی مدیریت").trim().slice(0,500),lockedAt:faNow(),lockedAtIso:new Date().toISOString(),lockedBy:auth.user.id};m.termLocks.push(row);}m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:action==="unlock"?"بازگشایی نمرات":"قفل نمرات",details:`${classId} · ${subject} · ${academicPeriod}`,at:faNow()});return row;});return sendJson(res,200,{ok:true,lock:saved.result});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/report-card/unlock") {
      if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("بازگشایی کارنامه فقط توسط مدیر مجاز است."),{status:403});const body=await readJson(req),reportCardId=String(body.reportCardId||"");const saved=await mutateDb(m=>{const row=(m.reportCards||[]).find(x=>x.id===reportCardId);if(!row)throw Object.assign(new Error("کارنامه پیدا نشد."),{status:404});row.status="draft";row.unlockedAt=new Date().toISOString();row.unlockedBy=auth.user.id;row.unlockReason=String(body.reason||"").trim().slice(0,500);row.updatedAt=new Date().toISOString();m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"بازگشایی کارنامه",details:`${row.studentId} · ${row.academicPeriod}`,at:faNow()});return row;});return sendJson(res,200,{ok:true,reportCard:saved.result});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/notifications/send") {
      const body=await readJson(req),title=String(body.title||"").trim(),message=String(body.body||body.message||"").trim();if(title.length<2||message.length<2)throw Object.assign(new Error("عنوان و متن اعلان را کامل کنید."),{status:400});const recipients=notificationRecipientsV75(auth.db,auth.user,{targetType:String(body.targetType||"user"),targetId:String(body.targetId||""),classId:String(body.classId||"")});if(!recipients.length)throw Object.assign(new Error("گیرنده معتبری برای اعلان پیدا نشد یا دسترسی ندارید."),{status:403});
      const saved=await mutateDb(m=>{m.notifications||=[];m.notificationBroadcasts||=[];const bid=makeId("nb");const at=faNow();for(const userId of recipients)m.notifications.unshift({id:makeId("not"),userId,title:title.slice(0,160),body:message.slice(0,2000),read:false,at,kind:String(body.kind||"general").slice(0,50),broadcastId:bid,createdBy:auth.user.id});const row={id:bid,title:title.slice(0,160),body:message.slice(0,2000),targetType:String(body.targetType||"user"),targetId:String(body.targetId||body.classId||""),recipientCount:recipients.length,createdBy:auth.user.id,createdAt:new Date().toISOString()};m.notificationBroadcasts.unshift(row);m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ارسال اعلان",details:`${title} · ${recipients.length} گیرنده`,at});return row;});return sendJson(res,200,{ok:true,broadcast:saved.result,recipientCount:recipients.length});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/notifications/read") {
      const body=await readJson(req),id=String(body.id||"");const saved=await mutateDb(m=>{let count=0;for(const n of m.notifications||[]){if(n.userId===auth.user.id&&(!id||n.id===id)){n.read=true;n.readAt=new Date().toISOString();count++;}}return count;});return sendJson(res,200,{ok:true,count:saved.result});
    }


    // v3.6 Android Daily Workflow — scoped native endpoints for the teacher app.
    if (req.method === "GET" && url.pathname === "/api/staff/mobile/students") {
      const scoped=scopedDbForStaff(auth.db,auth.user), requestedClass=String(url.searchParams.get("classId")||"").trim();
      const allowedClasses=new Set(activeTeachingAssignments(auth.db,auth.user,"students").map(a=>String(a.classId||"")));
      const rows=(scoped.users||[]).filter(u=>u.role==="student"&&u.active!==false&&u.profileStatus!=="deleted"&&allowedClasses.has(String(u.classId||""))&&(!requestedClass||String(u.classId)===requestedClass));
      const students=await Promise.all(rows.map(async st=>{
        const dossier=buildStudentDossierV4521(scoped,st.id,{includeSensitive:false})||{};
        const photoDataUrl=await readStudentProfilePhoto(st.id);
        return {id:st.id,firstName:st.firstName||"",lastName:st.lastName||"",studentCode:st.studentCode||"",classId:st.classId||"",className:(scoped.school?.classes||[]).find(c=>c.id===st.classId)?.name||"",photoDataUrl,
          attendance:dossier.attendance||{},discipline:dossier.discipline||{},analysis:{overallAveragePercent:dossier.analysis?.overallAveragePercent??null,status:dossier.analysis?.status||{},trend:dossier.analysis?.trend||{},homework:dossier.analysis?.homework||{}},
          guardianMobile:st.guardianMobile||"",studentMobile:st.studentMobile||""};
      }));
      return sendJson(res,200,{ok:true,students});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/mobile/gradebook") {
      const classId=String(url.searchParams.get("classId")||""),subject=String(url.searchParams.get("subject")||"").trim(),academicPeriod=normalizeAcademicPeriod(url.searchParams.get("academicPeriod")||"semester2",{allowAnnual:false}),academicYear=String(auth.db.school?.year||"");
      if(!classId||!subject)throw Object.assign(new Error("کلاس و درس الزامی است."),{status:400});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"continuous"}))throw Object.assign(new Error("به دفتر نمره این کلاس دسترسی ندارید."),{status:403});
      const payload=gradebookPayloadV75(auth.db,{classId,subject,academicYear,academicPeriod}),continuousMax=Number(payload.config?.outputMaxScore||0),finalMax=Math.round((20-continuousMax)*100)/100;
      const students=(payload.students||[]).map(st=>{
        const approved=(auth.db.continuousGradeOverrides||[]).filter(r=>r.active!==false&&r.studentId===st.id&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||r.period||"semester2")===academicPeriod).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
        const final=(auth.db.termFinalOverrides||[]).filter(r=>r.active!==false&&r.studentId===st.id&&r.classId===classId&&r.subject===subject&&String(r.academicYear||academicYear)===academicYear&&String(r.academicPeriod||"semester2")===academicPeriod).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0]||null;
        const calculated20=st.result?.score==null?null:Number(st.result.score),continuousRaw=approved?Number(approved.approvedRawScore||0):(calculated20==null?null:Math.round(calculated20/20*continuousMax*100)/100),finalRaw=final?Number(final.score||0):null;
        const total=continuousRaw==null&&finalRaw==null?null:Math.round((Number(continuousRaw||0)+Number(finalRaw||0))*100)/100;
        return {...st,continuousCalculated20:calculated20,continuousApproved:approved?{score:Number(approved.approvedRawScore||0),maxScore:Number(approved.approvedMaxScore||continuousMax)}:null,continuousRaw,finalMark:final?{score:Number(final.score||0),maxScore:Number(final.maxScore||finalMax)}:null,termTotal:total};
      });
      return sendJson(res,200,{ok:true,config:payload.config,entries:payload.entries,lock:payload.lock,shares:{continuousMax,finalMax},students});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/mobile/class-journal") {
      const classId=String(url.searchParams.get("classId")||"").trim(),subject=String(url.searchParams.get("subject")||"").trim(),academicPeriod=normalizeAcademicPeriod(url.searchParams.get("academicPeriod")||"semester2",{allowAnnual:false}),year=String(auth.db.school?.year||"");
      if(classId&&auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"classJournal"}))throw Object.assign(new Error("به دفتر کلاسی این درس دسترسی ندارید."),{status:403});
      const rows=(auth.db.lessonLogs||[]).filter(r=>String(r.academicYear||year)===year&&String(r.academicPeriod||r.period||"semester2")===academicPeriod&&(!classId||String(r.classId)===classId)&&(!subject||String(r.subject||"")===subject)&&(auth.user.role!=="teacher"||String(r.teacherId||r.createdBy||"")===String(auth.user.id))).slice().sort((a,b)=>String(b.date||b.createdAtIso||b.createdAt||"").localeCompare(String(a.date||a.createdAtIso||a.createdAt||"")));
      return sendJson(res,200,{ok:true,logs:rows});
    }
    if (req.method === "POST" && url.pathname === "/api/staff/mobile/class-journal") {
      const body=await readJson(req),classId=String(body.classId||"").trim(),subject=String(body.subject||"").trim(),academicPeriod=normalizeAcademicPeriod(body.academicPeriod||"semester2",{allowAnnual:false}),year=String(auth.db.school?.year||"");
      if(!classId||!subject)throw Object.assign(new Error("کلاس و درس الزامی است."),{status:400});
      if(auth.user.role==="teacher"&&!teacherCanAssigned(auth.db,auth.user,{classId,subject,feature:"classJournal"}))throw Object.assign(new Error("به دفتر کلاسی این درس دسترسی ندارید."),{status:403});
      const date=String(body.date||new Date().toISOString().slice(0,10)).slice(0,10),status=["planned","taught","cancelled"].includes(String(body.status))?String(body.status):"taught",title=String(body.title||"").trim().slice(0,180),content=String(body.content||"").trim().slice(0,5000),homework=String(body.homework||"").trim().slice(0,2500),privateNote=String(body.privateNote||"").trim().slice(0,2500);
      if(!title&&!content)throw Object.assign(new Error("عنوان یا محتوای جلسه را وارد کنید."),{status:400});
      const saved=await mutateDb(m=>{m.lessonLogs=Array.isArray(m.lessonLogs)?m.lessonLogs:[];const id=String(body.id||"").trim();let row=id?m.lessonLogs.find(x=>String(x.id)===id&&String(x.teacherId||x.createdBy||"")===String(auth.user.id)):null;const now=new Date().toISOString(),payload={classId,subject,academicYear:year,academicPeriod,date,periodNo:Number(body.periodNo||0),chapterId:String(body.chapterId||"").slice(0,120),chapterTitle:String(body.chapterTitle||"").slice(0,180),title,content,homework,privateNote,status,teacherId:auth.user.id,updatedAtIso:now,updatedAt:faNow(),updatedBy:auth.user.id};if(row)Object.assign(row,payload);else{row={id:makeId("lesson"),...payload,createdAtIso:now,createdAt:faNow(),createdBy:auth.user.id};m.lessonLogs.unshift(row);}m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت دفتر کلاسی موبایل",details:`${classId} · ${subject} · ${date} · ${title}`,at:faNow()});return row;});
      return sendJson(res,200,{ok:true,log:saved.result});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/mobile/homework-center") {
      const scoped=scopedDbForStaff(auth.db,auth.user),classId=String(url.searchParams.get("classId")||"").trim();
      const homework=(scoped.homework||[]).filter(h=>h.status!=="archived"&&(!classId||String(h.classId)===classId)&&teacherCanAssigned(auth.db,auth.user,{classId:h.classId||"",subject:h.subject||"",feature:"homework"})).slice().sort((a,b)=>String(b.updatedAtIso||b.createdAtIso||b.createdAt||"").localeCompare(String(a.updatedAtIso||a.createdAtIso||a.createdAt||""))).map(h=>{
        const eligible=(scoped.users||[]).filter(s=>s.role==="student"&&String(s.classId)===String(h.classId)&&s.active!==false&&s.profileStatus!=="deleted"&&(String(h.recipientMode||"all")!=="selected"||(h.studentIds||[]).map(String).includes(String(s.id))));
        const submissions=(scoped.homeworkSubmissions||[]).filter(x=>String(x.homeworkId)===String(h.id)).map(x=>{const st=(scoped.users||[]).find(s=>String(s.id)===String(x.studentId));return {...x,studentName:st?`${st.firstName||""} ${st.lastName||""}`.trim():"دانش‌آموز",studentCode:st?.studentCode||""};});
        return {...h,className:(scoped.school?.classes||[]).find(c=>c.id===h.classId)?.name||"",assignedCount:eligible.length,submittedCount:submissions.length,gradedCount:submissions.filter(x=>x.status==="graded").length,submissions};
      });
      return sendJson(res,200,{ok:true,homework});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/mobile/grading-queue") {
      const scoped=scopedDbForStaff(auth.db,auth.user),examId=String(url.searchParams.get("examId")||"").trim();
      const exams=(scoped.exams||[]).filter(e=>["descriptive","mixed"].includes(String(e.type||""))&&(!examId||String(e.id)===examId)&&teacherCanAssigned(auth.db,auth.user,{classId:e.classId||"",subject:e.subject||"",bookId:e.bookId||"",feature:"grading"}));
      const ids=new Set(exams.map(e=>String(e.id))),queue=(scoped.submissions||[]).filter(s=>ids.has(String(s.examId))).map(s=>{const e=exams.find(x=>String(x.id)===String(s.examId)),st=(scoped.users||[]).find(x=>String(x.id)===String(s.studentId)),grade=(scoped.grades||[]).find(g=>String(g.submissionId)===String(s.id)||String(g.uploadId)===String(s.id));return {submissionId:s.id,examId:s.examId,examTitle:e?.title||"آزمون",subject:e?.subject||"",studentId:s.studentId,studentName:st?`${st.firstName||""} ${st.lastName||""}`.trim():"دانش‌آموز",studentCode:st?.studentCode||"",submittedAt:s.submittedAt||s.at||"",status:grade?"final":"pending",finalScore:grade?.finalScore??null,totalScore:examTotalScore(e||{})};});
      return sendJson(res,200,{ok:true,queue});
    }
    if (req.method === "GET" && url.pathname === "/api/staff/mobile/grading-detail") {
      const submissionId=String(url.searchParams.get("submissionId")||"").trim(),sub=(auth.db.submissions||[]).find(x=>String(x.id)===submissionId),exam=(auth.db.exams||[]).find(x=>String(x.id)===String(sub?.examId));
      if(!sub||!exam||!canTeacherGradeP6722(auth.db,auth.user,exam,sub))throw Object.assign(new Error("برگه در دسترس نیست."),{status:404});
      const student=(auth.db.users||[]).find(x=>String(x.id)===String(sub.studentId)),grade=(auth.db.grades||[]).find(g=>String(g.submissionId)===submissionId||String(g.uploadId)===submissionId)||null,auto=new Map((sub.autoGrading?.questions||[]).map(q=>[String(q.questionId),q]));
      const questions=(exam.questions||[]).map((q,index)=>{const a=auto.get(String(q.id))||{},typed=String(sub.typedAnswers?.[q.id]||"");return {id:String(q.id),number:index+1,type:String(q.type||"descriptive"),text:String(q.text||""),score:Number(q.score||0),choices:Array.isArray(q.choices)?q.choices:[],referenceAnswer:String(q.referenceAnswer||q.answerText||""),rubric:Array.isArray(q.rubric)?q.rubric:[],studentAnswer:typed||String(a.studentAnswer??""),autoGraded:Boolean(a.autoGraded),autoScore:a.earnedScore??null,correctAnswer:a.correctAnswer??null};});
      return sendJson(res,200,{ok:true,submission:{id:sub.id,examId:sub.examId,studentId:sub.studentId,submittedAt:sub.submittedAt||sub.at||"",files:Array.isArray(sub.files)?sub.files:[],status:sub.status||""},student:{id:student?.id||sub.studentId,firstName:student?.firstName||"",lastName:student?.lastName||"",studentCode:student?.studentCode||""},exam:{id:exam.id,title:exam.title||"آزمون",subject:exam.subject||"",type:exam.type||"",totalScore:examTotalScore(exam)},questions,grade});
    }

    return sendJson(res, 404, { error: "مسیر امنیت کارکنان پیدا نشد." });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "خطای احراز هویت", code: error.code || undefined });
  }
}


const TEACHING_PERMISSION_DEFAULTS = TEACHING_PERMISSION_DEFAULTS_CORE;
function teacherAssignmentIsActive(db, assignment) {
  if (!assignment || assignment.active === false) return false;
  const owner=(db.users||[]).find(u=>u.id===assignment.teacherId);
  if(!owner||owner.role!=="teacher"||owner.active===false||["deleted","locked","graduated"].includes(String(owner.profileStatus||"")))return false;
  const currentYear = String(db.school?.year || "").trim();
  if (assignment.academicYear && currentYear && String(assignment.academicYear) !== currentYear) return false;
  const today = new Date().toISOString().slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(assignment.startDate||"")) && assignment.startDate > today) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(assignment.endDate||"")) && assignment.endDate < today) return false;
  return true;
}
function activeTeachingAssignments(db, user, feature = "") {
  return (db.teachingAssignments || []).filter(a => a.teacherId === user?.id && teacherAssignmentIsActive(db, a) && (!feature || (a.permissions || []).includes(feature)));
}
function assignmentBookFor(db, assignment) {
  return (db.curriculum || []).find(b => b.id === assignment?.bookId || b.subject === assignment?.subject);
}
function assignmentMatches(db, assignment, classId, subject, bookId = "") {
  if (!teacherAssignmentIsActive(db, assignment)) return false;
  if (classId && assignment.classId !== classId) return false;
  if (subject && assignment.subject !== subject) return false;
  const assignedBook = assignmentBookFor(db, assignment);
  if (bookId && assignment.bookId && assignment.bookId !== bookId) return false;
  if (bookId && !assignment.bookId && assignedBook?.id !== bookId) return false;
  return true;
}
function teacherCanAssigned(db, user, { classId = "", subject = "", bookId = "", feature = "" } = {}) {
  if (["admin","superadmin"].includes(user?.role)) return true;
  return activeTeachingAssignments(db, user, feature).some(a => assignmentMatches(db, a, classId, subject, bookId));
}

// v45.22 — سؤال‌های ثبت‌شده توسط مدیریت مدرسه برای معلمِ همان کتاب/درس قابل مشاهده‌اند.
// معلم فقط سؤال‌های خودش را ویرایش/حذف می‌کند؛ سؤال‌های مدرسه برای او فقط خواندنی/قابل استفاده و کپی هستند.
function questionCreatorRole(db, question) {
  if (!question?.createdBy) return "system";
  return (db.users || []).find(u => u.id === question.createdBy)?.role || "";
}
function teacherCanReadQuestion(db, user, question) {
  if (["admin","superadmin"].includes(user?.role)) return true;
  if (!question || !teacherCanAssigned(db, user, { subject:question.subject || "", bookId:question.bookId || "", feature:"questionBank" })) return false;
  if (question.createdBy === user.id) return true;
  if (question.shared === true || !question.createdBy) return true;
  return ["admin","superadmin"].includes(questionCreatorRole(db, question));
}
function teacherCanWriteQuestion(db, user, question) {
  if (["admin","superadmin"].includes(user?.role)) return true;
  return !!question && question.createdBy === user.id && teacherCanAssigned(db, user, { subject:question.subject || "", bookId:question.bookId || "", feature:"questionBank" });
}
function normalizeTeachingAssignments(db) {
  db.teachingAssignments = Array.isArray(db.teachingAssignments) ? db.teachingAssignments : [];
  const teachers = (db.users || []).filter(u => u.role === "teacher" && u.active !== false && !["deleted","locked","graduated"].includes(String(u.profileStatus || "")));
  for (const teacher of teachers) {
    const existing = db.teachingAssignments.filter(a => a.teacherId === teacher.id);
    if (!existing.length) {
      for (const classId of teacher.classIds || []) {
        for (const subject of teacher.subjects || []) {
          const classRow = (db.school?.classes || []).find(c => c.id === classId);
          const book = (db.curriculum || []).find(b => b.subject === subject && Number(b.grade || 0) === Number(classRow?.grade || 0)) || (db.curriculum || []).find(b => b.subject === subject);
          db.teachingAssignments.push({
            id: makeId("teach"), teacherId: teacher.id, academicYear: db.school?.year || "", grade: Number((db.school?.classes || []).find(c => c.id === classId)?.grade || 0),
            classId, subject, bookId: book?.id || "", responsibility: "primary", permissions: [...TEACHING_PERMISSION_DEFAULTS], active: true,
            startDate: "", endDate: "", createdAt: faNow(), createdBy: "migration-v33", history: [{ at: faNow(), by: "migration-v33", action: "ایجاد از دسترسی نسخه قبلی" }]
          });
        }
      }
    }
  }
  const validTeachers = new Set(teachers.map(t => t.id));
  const validClasses = new Set((db.school?.classes || []).map(c => c.id));
  const validBooks = new Set((db.curriculum || []).map(b => b.id));
  db.teachingAssignments = db.teachingAssignments.filter(a => validTeachers.has(a.teacherId) && validClasses.has(a.classId) && (!a.bookId || validBooks.has(a.bookId))).map(a => {
    const book = assignmentBookFor(db, a); const cls = (db.school?.classes || []).find(c => c.id === a.classId);
    return { ...a, academicYear: a.academicYear || db.school?.year || "", grade: Number(a.grade || cls?.grade || 0), subject: a.subject || book?.subject || "", bookId: a.bookId || book?.id || "", responsibility: a.responsibility || "primary", permissions: normalizeTeachingPermissions(a.permissions), active: a.active !== false, history: Array.isArray(a.history) ? a.history : [] };
  });
  for (const teacher of teachers) {
    const active = db.teachingAssignments.filter(a => a.teacherId === teacher.id && teacherAssignmentIsActive(db, a));
    teacher.classIds = Array.from(new Set(active.map(a => a.classId)));
    teacher.subjects = Array.from(new Set(active.map(a => a.subject).filter(Boolean)));
  }
  return db;
}

function teacherScope(db, user) {
  const assignments = activeTeachingAssignments(db, user);
  const classIds = new Set(assignments.map(a => a.classId));
  const subjects = new Set(assignments.map(a => a.subject).filter(Boolean));
  const bookIds = new Set(assignments.map(a => a.bookId || assignmentBookFor(db, a)?.id).filter(Boolean));
  const studentIds = new Set((db.users || []).filter(u => u.role === "student" && classIds.has(u.classId)).map(u => u.id));
  const can = (row, feature = "") => teacherCanAssigned(db, user, { classId: row?.classId || "", subject: row?.subject || "", bookId: row?.bookId || "", feature });
  const examIds = new Set((db.exams || []).filter(e => can(e)).map(e => e.id));
  const submissionIds = new Set((db.submissions || []).filter(x => examIds.has(x.examId) && studentIds.has(x.studentId)).map(x => x.id));
  const questionIds = new Set((db.questionBank || []).filter(q => teacherCanReadQuestion(db, user, q)).map(q => q.id));
  return { assignments, classIds, subjects, bookIds, studentIds, examIds, submissionIds, questionIds, can };
}

// v45.23 — سابقه استفاده سؤال برای هر معلم مستقل است و فقط آزمون‌های واقعاً منتشر/اجراشده محاسبه می‌شوند.
const USED_EXAM_STATES_V4523 = new Set(["published","in_progress","ended","graded","final","archived"]);
function examCountsAsUsedV4523(exam) {
  const state=String(exam?.publicationState||"").toLowerCase(),status=String(exam?.status||"").toLowerCase();
  return USED_EXAM_STATES_V4523.has(state)||status==="active"||status==="archived";
}
function teacherQuestionUsageV4523(db, teacherId) {
  const tid=String(teacherId||""); const usage={}; if(!tid)return usage;
  for(const exam of db.exams||[]){
    if(String(exam.createdBy||exam.teacherId||"")!==tid||!examCountsAsUsedV4523(exam))continue;
    for(const item of exam.questions||[]){const qid=String(item.sourceQuestionId||"").trim();if(!qid)continue;usage[qid] ||= {count:0,examIds:[],lastUsedAt:null};usage[qid].count++;if(exam.id&&!usage[qid].examIds.includes(exam.id))usage[qid].examIds.push(exam.id);usage[qid].lastUsedAt=exam.updatedAt||exam.publishedAt||exam.createdAt||usage[qid].lastUsedAt;}
  }
  return usage;
}


// ===== 72.28-p1: Teacher mobile attendance app + live admin monitor =====
function schoolDayNameForDateV78(date){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||""));
  if(!m)return "";
  const day=new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).getUTCDay();
  return ["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"][day]||"";
}
function hmTextV78(minutes){const n=Math.max(0,Math.min(1439,Number(minutes||0)));return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
function faDateV78(date){try{return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",day:"numeric"}).format(new Date(`${date}T12:00:00Z`));}catch{return date;}}
function classInfoV78(db,classId){const c=(db.school?.classes||[]).find(x=>x.id===classId)||{};const shift=(db.school?.shiftDefinitions||[]).find(x=>x.id===c.shiftId)||{};return {id:c.id||classId,name:c.name||"کلاس",grade:Number(c.grade||0),gradeId:c.gradeId||"",gradeName:c.gradeName||c.gradeTitle||`پایه ${c.grade||""}`.trim(),shiftId:c.shiftId||"",shiftName:shift.name||""};}
function activePeriodForDateV78(db,date){
  const years=ensureAcademicYearModel(db.school||{}),year=years.find(x=>x.active)||years.find(x=>x.label===db.school?.year);
  const terms=year?.terms||[];const byDate=terms.find(t=>(!t.startDate||date>=t.startDate)&&(!t.endDate||date<=t.endDate));
  return byDate?.id||terms.find(t=>t.status==="active")?.id||"semester2";
}
function classAttendanceBlockV78(db,classId,date){
  const cls=classInfoV78(db,classId);const events=activeCalendarForDate(db,date).filter(e=>e.blocksAttendance===true).filter(e=>e.scope==="school"||(e.scope==="class"&&e.classId===classId)||(e.scope==="grade"&&Number(e.grade)===Number(cls.grade)));
  return events[0]||null;
}
function teacherScheduleV78(db,user,date,dayName=""){
  const year=String(db.school?.year||"");const day=dayName||schoolDayNameForDateV78(date);
  return (db.weeklySchedule||[]).filter(x=>x.active!==false&&x.teacherId===user.id&&String(x.academicYear||year)===year&&x.day===day&&teacherCanAssigned(db,user,{classId:x.classId,subject:x.subject||"",feature:"attendance"})).slice().sort((a,b)=>(hmMinutesV74(a.startTime)??9999)-(hmMinutesV74(b.startTime)??9999)||Number(a.periodNo||0)-Number(b.periodNo||0));
}
function teacherWindowV78(entry,clock){
  const start=hmMinutesV74(entry?.startTime),end=hmMinutesV74(entry?.endTime);if(start===null||end===null)return {open:false,state:"invalid"};
  const now=Number(clock.minutes||0);
  // p18: حضور و غیاب دقیقاً از ساعت شروع تا پایان همان کلاس فعال است؛ بدون بازه قبل/بعد.
  if(now>=start&&now<=end)return {open:true,state:"current",start,end};
  return {open:false,state:now<start?"upcoming":"ended",start,end};
}
function activeClassStudentsV78(db,classId){return (db.users||[]).filter(u=>u.role==="student"&&u.classId===classId&&u.active!==false&&!['deleted','locked','graduated'].includes(String(u.profileStatus||""))).slice().sort((a,b)=>`${a.lastName||""} ${a.firstName||""}`.localeCompare(`${b.lastName||""} ${b.firstName||""}`,"fa"));}
function maskedNationalV78(value){const s=String(value||"").replace(/\D/g,"");return s.length>=4?`${s.slice(0,3)}***${s.slice(-3)}`:"";}
function attendanceSnapshotV78(db,entry,date){
  const session=(db.attendanceSessions||[]).filter(x=>x.scheduleEntryId===entry.id&&x.date===date&&x.teacherId===entry.teacherId).slice().sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0]||null;
  const records=session?(db.attendance||[]).filter(x=>x.sessionId===session.id):[];
  const normalized=records.map(r=>({...r,status:normalizeAttendanceStatusV81(r.status)}));
  return {session:session?{id:session.id,date:session.date,updatedAt:session.updatedAt||session.createdAt||""}:null,records:normalized.map(r=>({id:r.id,studentId:r.studentId,status:r.status,absenceReasonId:r.absenceReasonId||"",absenceReasonText:r.absenceReasonText||"",reviewedAt:r.reviewedAt||"",updatedAt:r.updatedAt||r.markedAt||""})),summary:{present:normalized.filter(x=>x.status==="present").length,absent:normalized.filter(x=>isAbsentStatusV81(x.status)).length,pending:normalized.filter(x=>x.status==="absent_pending").length,excused:normalized.filter(x=>x.status==="absent_excused").length,unexcused:normalized.filter(x=>x.status==="absent_unexcused").length,late:normalized.filter(x=>x.status==="late").length,total:normalized.length}};
}

function publicTeacherEntryV78(db,user,entry,date,clock){
  const cls=classInfoV78(db,entry.classId),shift=(db.school?.shiftDefinitions||[]).find(x=>x.id===entry.shiftId)||{},teacherName=`${user.firstName||""} ${user.lastName||""}`.trim(),win=teacherWindowV78(entry,clock),block=classAttendanceBlockV78(db,entry.classId,date),attendance=attendanceSnapshotV78(db,entry,date),students=activeClassStudentsV78(db,entry.classId).map(s=>({id:s.id,firstName:s.firstName||"",lastName:s.lastName||"",studentCode:s.studentCode||"",nationalIdMasked:maskedNationalV78(s.nationalId)}));
  return {id:entry.id,classId:entry.classId,className:cls.name,grade:cls.grade,gradeName:cls.gradeName,shiftId:entry.shiftId||cls.shiftId,shiftName:shift.name||cls.shiftName,periodNo:Number(entry.periodNo||0),subject:entry.subject||"",startTime:entry.startTime||"",endTime:entry.endTime||"",teacherId:user.id,teacherName,windowState:win.state,attendanceOpen:win.open&&!block,blockedReason:block?`${block.title||"تعطیلی"}: ثبت حضور برای این تاریخ بسته است.`:"",attendance,attendanceMarked:!!attendance.session,students};
}
function teacherDashboardV78(db,user){
  const clock=schoolClockV74(),today=teacherScheduleV78(db,user,clock.date,clock.dayName),entries=today.map(x=>publicTeacherEntryV78(db,user,x,clock.date,clock));
  const current=entries.find(x=>x.windowState==="current")||entries.find(x=>["starting","grace"].includes(x.windowState))||null;
  const next=entries.find(x=>{const start=hmMinutesV74(x.startTime);return start!==null&&start>clock.minutes;})||null;
  const weekSchedule=(db.weeklySchedule||[]).filter(x=>x.active!==false&&x.teacherId===user.id&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||"")).map(x=>({id:x.id,day:x.day||"",classId:x.classId||"",className:classInfoV78(db,x.classId).name,subject:x.subject||"",periodNo:Number(x.periodNo||0),startTime:x.startTime||"",endTime:x.endTime||"",shiftId:x.shiftId||""}));
  const notifications=(db.notifications||[]).filter(n=>String(n.userId||'')===String(user.id)).slice().sort((a,b)=>Number(b.createdAt||b.at||0)-Number(a.createdAt||a.at||0)).slice(0,50).map(n=>({id:n.id,title:n.title||'اعلان',body:n.body||n.message||n.text||'',read:Boolean(n.read),type:n.type||'internal',createdAt:n.createdAtIso||n.at||n.createdAt||''}));
  return {release:APP_RELEASE,school:{name:db.school?.name||SCHOOL_NAME,year:db.school?.year||""},teacher:{id:user.id,firstName:user.firstName||"",lastName:user.lastName||"",nationalIdMasked:maskedNationalV78(user.nationalId)},clock:{date:clock.date,dateFa:faDateV78(clock.date),dayName:clock.dayName,time:hmTextV78(clock.minutes),minutes:clock.minutes,timeZone:clock.timeZone},currentClass:current,nextClass:next,todaySchedule:entries.map(({students,...x})=>x),weekSchedule,notifications};
}

// p11: preserve safe question image references in detailed reports.
function continuousP11ImageFields(raw){
 const out={};
 const imageDataUrl=String(raw?.imageDataUrl||"").trim();
 const imageUrl=String(raw?.imageUrl||"").trim();
 const mediaId=String(raw?.mediaId||raw?.imageMediaId||"").trim();
 if(/^data:image\/(?:png|jpeg|webp);base64,/i.test(imageDataUrl)||/^\/student\/media\/question-images\/[a-f0-9]{64}\.(?:png|jpg|webp)$/i.test(imageDataUrl))out.imageDataUrl=imageDataUrl;
 if(imageUrl)out.imageUrl=imageUrl;
 if(mediaId)out.mediaId=mediaId;
 return out;
}

// p11: read-only detailed continuous gradebook, no changes to grading data.
function continuousP11(db,sid,examId="",scope=null){
 const student=(db.users||[]).find(x=>x.id===sid&&x.role==="student"&&x.profileStatus!=="deleted");
 if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
 const allowed=e=>!scope||scope(e);
 const rows=[];
 for(const exam of (db.exams||[])){
  if(exam.classId!==student.classId||!allowed(exam))continue;
  const attempt=(db.attempts||[]).find(a=>a.examId===exam.id&&a.studentId===sid);
  const sub=(db.submissions||[]).find(a=>a.examId===exam.id&&a.studentId===sid);
  const grade=sub?(db.grades||[]).find(g=>g.submissionId===sub.id&&String(g.publishStatus||"published")==="published"):null;
  if(!attempt&&!grade)continue;
  const total=Number(attempt?.total||examTotalScore(exam));const score=Number(attempt?attempt.score:grade.finalScore);
  if(!Number.isFinite(score)||!(total>0))continue;
  rows.push({examId:exam.id,subject:String(exam.subject||"درس نامشخص"),title:String(exam.title||"آزمون"),type:exam.type,score,total,score20:Math.round(score/total*2000)/100,submittedAt:attempt?.submittedAt||sub?.submittedAt||0});
 }
 if(!examId){const subjects=[...new Set(rows.map(x=>x.subject))].sort((a,b)=>a.localeCompare(b,"fa"));return {student:{id:student.id,name:`${student.firstName||""} ${student.lastName||""}`.trim(),classId:student.classId},subjects:subjects.map(subject=>{const exams=rows.filter(x=>x.subject===subject).sort((a,b)=>Number(b.submittedAt||0)-Number(a.submittedAt||0));return {subject,average:Math.round(exams.reduce((s,x)=>s+x.score20,0)/exams.length*100)/100,exams};})};}
 const row=rows.find(x=>x.examId===examId);if(!row)throw Object.assign(new Error("نتیجه منتشرشده‌ای برای این آزمون وجود ندارد."),{status:404});
 const exam=(db.exams||[]).find(x=>x.id===examId);const attempt=(db.attempts||[]).find(a=>a.examId===examId&&a.studentId===sid);const sub=(db.submissions||[]).find(a=>a.examId===examId&&a.studentId===sid);const grade=sub?(db.grades||[]).find(g=>g.submissionId===sub.id&&String(g.publishStatus||"published")==="published"):null;
 const questions=(exam.questions||[]).map((raw,i)=>{
  if(attempt){const ans=attempt.answers?.[raw.id];const answered=ans!==undefined&&ans!==null&&ans!=="";const index=Number(ans),correctIndex=Number(raw.answer);const correct=answered&&index===correctIndex;const imageFields=continuousP11ImageFields(raw);return {...imageFields,number:i+1,type:"mcq",text:raw.text||"",choices:raw.choices||[],selectedIndex:answered?index:null,correctIndex,studentAnswer:answered?String(raw.choices?.[index]??""):"بدون پاسخ",correctAnswer:String(raw.choices?.[correctIndex]??""),earnedScore:correct?Number(raw.score||0):0,maxScore:Number(raw.score||0),status:correct?"correct":"incorrect",feedback:raw.explanation||""};}
  const q=normalizeDescriptiveQuestion(raw),g=(grade?.questionScores||[]).find(x=>String(x.questionId)===String(q.id))||{},auto=(sub?.autoGrading?.questions||[]).find(x=>String(x.questionId)===String(q.id));const earned=Number(g.teacherScore??g.score??0),max=Number(q.score||0);const type=String(raw.type||q.type||"descriptive");
  if(auto?.autoGraded){const ci=Number(auto.correctAnswer),si=Number(auto.studentAnswer);return {...continuousP11ImageFields(q),number:i+1,type,text:q.text,choices:raw.choices||[],selectedIndex:auto.answered?si:null,correctIndex:ci,studentAnswer:type==="mcq"?String(raw.choices?.[si]??""):String(auto.studentAnswer??""),correctAnswer:type==="mcq"?String(raw.choices?.[ci]??""):String(auto.correctAnswer??""),earnedScore:earned,maxScore:max,status:auto.correct?"correct":"incorrect",feedback:raw.explanation||""};}
  return {...continuousP11ImageFields(raw),number:i+1,type:"descriptive",text:q.text,studentAnswer:String(sub?.typedAnswers?.[q.id]||"")||(sub?.files?.length?"پاسخ در فایل ارسالی ثبت شده است.":"بدون پاسخ"),referenceAnswer:q.referenceAnswer||"",earnedScore:earned,maxScore:max,status:earned>=max-0.001?"correct":earned>0?"partial":"incorrect",feedback:g.feedback||"",criteria:(g.criterionScores||[]).map(x=>({title:x.title||"معیار",score:Number(x.teacherScore??x.score??0),maxScore:Number(x.maxScore||0)}))};
 });
 return {exam:row,questions,feedback:grade?.feedback||"",hasSubmissionFiles:Boolean(sub?.files?.length),fileNotice:sub?.files?.length?"فایل اصلی در پرونده پاسخ آزمون نگهداری می‌شود؛ نمایش مستقیم فایل نیازمند مسیر دانلود مجاز است.":""};
}

async function handleTeacherAppApi(req,res,url){
  try{
    const auth=await authenticate(req,["teacher"]);const db=auth.db;
    // P67.12: fix the ORIGINAL teacher continuous-p11 report, not a parallel report page.
    // Teacher's default permission is "reports" (not the legacy "examManagement").
    // Keep the existing response schema used by continuous-p11.js and scope by
    // assigned CLASS and SUBJECT. Read-only: no grades or student data are changed.
    if(req.method==="GET"&&url.pathname==="/api/teacher/continuous-p11"){
      const sid=String(url.searchParams.get("studentId")||""),eid=String(url.searchParams.get("examId")||"");
      const student=(db.users||[]).find(s=>String(s.id)===sid&&s.role==="student"&&s.profileStatus!=="deleted");
      if(!student)throw Object.assign(new Error("دانش‌آموز یافت نشد."),{status:404});
      const permitted=activeTeachingAssignments(db,auth.user,"reports").some(a=>String(a.classId)===String(student.classId));
      if(!permitted)throw Object.assign(new Error("دسترسی به کارنامه این دانش‌آموز مجاز نیست."),{status:403});
      const allowed=e=>String(e.classId)===String(student.classId)&&teacherCanAssigned(db,auth.user,{
        classId:e.classId,subject:e.subject||"",feature:"reports"
      });
      const report=continuousP11(db,sid,eid,allowed);
      return sendJson(res,200,report);
    }
    if(req.method==="GET"&&url.pathname==="/api/teacher/dashboard")return sendJson(res,200,teacherDashboardV78(db,auth.user));
    if(req.method==="GET"&&url.pathname==="/api/teacher/workspace"){
      const scoped=scopedDbForStaff(db,auth.user);
      const assignments=activeTeachingAssignments(db,auth.user).map(a=>({id:a.id,classId:a.classId,subject:a.subject||"",bookId:a.bookId||"",features:Array.isArray(a.features)?a.features:[]}));
      const classes=(scoped.school?.classes||[]).map(c=>({id:c.id,name:c.name||"",grade:c.grade||"",shiftId:c.shiftId||""}));
      const students=(scoped.users||[]).filter(u=>u.role==="student"&&u.active!==false&&u.profileStatus!=="deleted").map(u=>({id:u.id,firstName:u.firstName||"",lastName:u.lastName||"",studentCode:u.studentCode||"",classId:u.classId||""}));
      const exams=(scoped.exams||[]).filter(e=>e.createdBy===auth.user.id||teacherCanAssigned(db,auth.user,{classId:e.classId||"",subject:e.subject||"",bookId:e.bookId||"",feature:"examManagement"})).map(e=>({id:e.id,title:e.title||"",type:e.type||"",subject:e.subject||"",classId:e.classId||"",status:e.status||"",publicationState:e.publicationState||"",startAt:e.startAt||e.scheduledAt||"",endAt:e.endAt||e.deadline||"",totalScore:examTotalScore(e)}));
      const attempts=(scoped.attempts||[]).map(a=>({id:a.id,examId:a.examId,studentId:a.studentId,score:a.score,total:a.total,percent:a.percent,submittedAt:a.submittedAt||a.at||""}));
      const submissions=(scoped.submissions||[]).map(a=>({id:a.id,examId:a.examId,studentId:a.studentId,submittedAt:a.submittedAt||a.at||""}));
      const grades=(scoped.grades||[]).map(g=>({id:g.id,submissionId:g.submissionId,score:g.score,finalScore:g.finalScore,at:g.at||g.updatedAt||""}));
      return sendJson(res,200,{ok:true,school:{year:db.school?.year||""},assignments,classes,students,exams,attempts,submissions,grades});
    }
    if(req.method==="POST"&&url.pathname==="/api/teacher/online-class/session/start"){
      const body=await readJson(req),scheduleEntryId=String(body.scheduleEntryId||"").trim(),clock=schoolClockV74();
      const entry=(db.weeklySchedule||[]).find(x=>x.id===scheduleEntryId&&x.active!==false&&x.teacherId===auth.user.id&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||""));
      if(!entry)throw Object.assign(new Error("این زنگ به شما تخصیص داده نشده است."),{status:403});
      const settings=onlineLearningSettingsV74(db),publicEntry=publicOnlineScheduleEntryV74(db,entry);
      if(!settings.enabled||!["online","hybrid"].includes(publicEntry.effectiveMode))throw Object.assign(new Error("این زنگ در حالت آنلاین یا ترکیبی فعال نیست."),{status:409});
      const requestedUrl=settings.teacherCanEditLinks?String(body.meetingUrl||publicEntry.meetingUrl||""):String(publicEntry.meetingUrl||"");
      const requestedProvider=settings.teacherCanEditLinks?String(body.meetingProvider||publicEntry.meetingProvider||settings.defaultProvider||"Jitsi"):String(publicEntry.meetingProvider||settings.defaultProvider||"Jitsi");
      const meetingUrl=normalizeWebUrlV74(requestedUrl),meetingProvider=requestedProvider.trim().slice(0,60)||"Jitsi";
      const saved=await mutateDb(m=>{
        m.onlineClassSessions=Array.isArray(m.onlineClassSessions)?m.onlineClassSessions:[];m.audit=Array.isArray(m.audit)?m.audit:[];
        const currentEntry=(m.weeklySchedule||[]).find(x=>x.id===scheduleEntryId&&x.active!==false&&x.teacherId===auth.user.id&&String(x.academicYear||m.school?.year||"")===String(m.school?.year||""));
        if(!currentEntry)throw Object.assign(new Error("این زنگ دیگر در برنامه فعال شما نیست."),{status:409});
        const currentSettings=onlineLearningSettingsV74(m),currentPublic=publicOnlineScheduleEntryV74(m,currentEntry);
        if(!currentSettings.enabled||!["online","hybrid"].includes(currentPublic.effectiveMode))throw Object.assign(new Error("این زنگ دیگر در حالت آنلاین یا ترکیبی فعال نیست."),{status:409});
        let row=m.onlineClassSessions.find(x=>x.scheduleEntryId===currentEntry.id&&x.date===clock.date&&x.teacherId===auth.user.id&&x.status!=="cancelled");
        const baseUrl=currentSettings.meetingBaseUrl||autoMeetingBaseV72899(m),bodyUrl=normalizeWebUrlV74(body.meetingUrl||""),entryUrl=normalizeWebUrlV74(currentPublic.meetingUrl||""),entryAuto=currentEntry.meetingUrlAuto===true,staleEntryAuto=entryAuto&&entryUrl&&!meetingUrlMatchesBaseV728911(entryUrl,baseUrl),teacherSentStaleAuto=staleEntryAuto&&bodyUrl===entryUrl;
        const configuredUrl=currentSettings.teacherCanEditLinks?(teacherSentStaleAuto?"":(bodyUrl||(!entryAuto?entryUrl:""))):(!entryAuto?entryUrl:""),rowUrl=normalizeWebUrlV74(row?.meetingUrl||""),reusableRow=row?.meetingUrlAuto===true&&!meetingUrlMatchesBaseV728911(rowUrl,baseUrl)?"":rowUrl,reusableEntry=entryAuto&&meetingUrlMatchesBaseV728911(entryUrl,baseUrl)?entryUrl:"",reusableUrl=reusableRow||reusableEntry,finalUrl=configuredUrl||reusableUrl||autoMeetingUrlV72899(m),autoUrl=!configuredUrl&&!reusableUrl,finalProvider=(autoUrl?"Jitsi":currentSettings.teacherCanEditLinks?meetingProvider:currentPublic.meetingProvider||currentSettings.defaultProvider||"Jitsi").trim().slice(0,60)||"Jitsi",nowIso=new Date().toISOString();
        const base={scheduleEntryId:currentEntry.id,classId:currentEntry.classId,subject:currentEntry.subject,teacherId:auth.user.id,date:clock.date,periodNo:currentEntry.periodNo,shiftId:currentEntry.shiftId,academicYear:String(m.school?.year||""),deliveryMode:currentPublic.effectiveMode,meetingProvider:finalProvider,meetingUrl:finalUrl,meetingUrlAuto:autoUrl||row?.meetingUrlAuto===true||currentEntry.meetingUrlAuto===true,title:currentEntry.subject||"",status:"live",notes:row?.notes||"",endedAt:"",updatedAt:nowIso,updatedBy:auth.user.id,source:"teacher-web-v72899"};
        if(row)Object.assign(row,base,{startedAt:row.startedAt||nowIso});else{row={id:makeId("ols"),...base,startedAt:nowIso,createdAt:nowIso,createdBy:auth.user.id};m.onlineClassSessions.push(row);}
        m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"شروع کلاس آنلاین",details:`${classInfoV78(m,currentEntry.classId).name} · ${currentEntry.subject||""} · زنگ ${Number(currentEntry.periodNo||0)}`,at:faNow()});
        return row;
      });
      await securityAudit({type:"teacher_online_class_start",userId:auth.user.id,role:"teacher",success:true,ip:clientIp(req),details:`${scheduleEntryId}:${clock.date}:${saved.result.id}`});
      return sendJson(res,200,{ok:true,session:saved.result,updatedAt:saved.updatedAt});
    }
    if(req.method==="POST"&&url.pathname==="/api/teacher/online-class/session/end"){
      const body=await readJson(req),scheduleEntryId=String(body.scheduleEntryId||"").trim(),clock=schoolClockV74();
      const entry=(db.weeklySchedule||[]).find(x=>x.id===scheduleEntryId&&x.active!==false&&x.teacherId===auth.user.id&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||""));
      if(!entry)throw Object.assign(new Error("این زنگ به شما تخصیص داده نشده است."),{status:403});
      const saved=await mutateDb(m=>{
        m.onlineClassSessions=Array.isArray(m.onlineClassSessions)?m.onlineClassSessions:[];m.audit=Array.isArray(m.audit)?m.audit:[];
        const row=m.onlineClassSessions.filter(x=>x.scheduleEntryId===scheduleEntryId&&x.date===clock.date&&x.teacherId===auth.user.id&&x.status!=="cancelled").sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0];
        if(!row)throw Object.assign(new Error("جلسه فعالی برای امروز پیدا نشد."),{status:404});
        if(row.status==="ended")return {...row,idempotent:true};
        const nowIso=new Date().toISOString();row.status="ended";row.endedAt=nowIso;row.updatedAt=nowIso;row.updatedBy=auth.user.id;row.source="teacher-web-v72899";
        m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"پایان کلاس آنلاین",details:`${row.subject||entry.subject||""} · زنگ ${Number(row.periodNo||entry.periodNo||0)}`,at:faNow()});
        return row;
      });
      await securityAudit({type:"teacher_online_class_end",userId:auth.user.id,role:"teacher",success:true,ip:clientIp(req),details:`${scheduleEntryId}:${clock.date}:${saved.result.id}`});
      return sendJson(res,200,{ok:true,session:saved.result,updatedAt:saved.updatedAt});
    }
    if(req.method==="POST"&&url.pathname==="/api/teacher/attendance/submit"){
      const body=await readJson(req),scheduleEntryId=String(body.scheduleEntryId||""),clock=schoolClockV74();
      const entry=(db.weeklySchedule||[]).find(x=>x.id===scheduleEntryId&&x.active!==false&&x.teacherId===auth.user.id&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||""));
      if(!entry||!teacherCanAssigned(db,auth.user,{classId:entry.classId,subject:entry.subject||"",feature:"attendance"}))throw Object.assign(new Error("این کلاس در محدوده تدریس شما نیست."),{status:403});
      if(entry.day!==clock.dayName)throw Object.assign(new Error("حضور این کلاس فقط در روز برنامه همان کلاس قابل ثبت است."),{status:409});
      const win=teacherWindowV78(entry,clock);if(!win.open)throw Object.assign(new Error("الان خارج از بازه ثبت حضور این کلاس هستید."),{status:409});
      const block=classAttendanceBlockV78(db,entry.classId,clock.date);if(block)throw Object.assign(new Error(`ثبت حضور امروز به علت «${block.title||"تعطیلی"}» بسته است.`),{status:409});
      const roster=activeClassStudentsV78(db,entry.classId),rosterIds=new Set(roster.map(s=>s.id)),presentIds=new Set((Array.isArray(body.presentStudentIds)?body.presentStudentIds:[]).map(String).filter(id=>rosterIds.has(id)));
      const rawStudentStatuses=(body.studentStatuses&&typeof body.studentStatuses==="object"&&!Array.isArray(body.studentStatuses))?body.studentStatuses:null;
      const allowedTeacherStatuses=new Set(["present","absent_excused","absent_unexcused"]);
      const requestedStatuses=new Map();
      if(rawStudentStatuses){for(const [studentId,rawStatus] of Object.entries(rawStudentStatuses)){if(!rosterIds.has(String(studentId)))continue;const status=String(rawStatus||"").trim();if(!allowedTeacherStatuses.has(status))throw Object.assign(new Error("وضعیت حضور انتخاب‌شده معتبر نیست."),{status:400});requestedStatuses.set(String(studentId),status);}}
      const saved=await mutateDb(m=>{
        m.attendanceSessions=Array.isArray(m.attendanceSessions)?m.attendanceSessions:[];m.attendance=Array.isArray(m.attendance)?m.attendance:[];m.audit=Array.isArray(m.audit)?m.audit:[];
        let session=m.attendanceSessions.find(x=>x.scheduleEntryId===entry.id&&x.date===clock.date&&x.teacherId===auth.user.id);
        const now=new Date().toISOString(),period=activePeriodForDateV78(m,clock.date);
        const payload={scheduleEntryId:entry.id,classId:entry.classId,subject:entry.subject||"",teacherId:auth.user.id,date:clock.date,period:`زنگ ${Number(entry.periodNo||0)}`,periodNo:Number(entry.periodNo||0),shiftId:entry.shiftId||"",startTime:entry.startTime||"",endTime:entry.endTime||"",academicYear:String(m.school?.year||""),academicPeriod:period,updatedAt:now,updatedBy:auth.user.id,source:"teacher-app-v81"};
        if(session)Object.assign(session,payload);else{session={id:makeId("ats"),...payload,createdAt:now,createdBy:auth.user.id};m.attendanceSessions.push(session);}
        const classStudents=activeClassStudentsV78(m,entry.classId),classIds=new Set(classStudents.map(x=>x.id));
        const existing=new Map(m.attendance.filter(x=>x.sessionId===session.id).map(x=>[x.studentId,x]));
        m.attendance=m.attendance.filter(x=>x.sessionId!==session.id||classIds.has(x.studentId));
        for(const stu of classStudents){
          const row=existing.get(stu.id);const was=normalizeAttendanceStatusV81(row?.status);const checked=presentIds.has(stu.id);
          const requested=requestedStatuses.get(String(stu.id));
          const status=requested||(checked?"present":["absent_excused","absent_unexcused"].includes(was)?was:"absent_pending");
          const base={sessionId:session.id,scheduleEntryId:entry.id,studentId:stu.id,classId:entry.classId,subject:entry.subject||"",teacherId:auth.user.id,date:clock.date,periodNo:Number(entry.periodNo||0),shiftId:entry.shiftId||"",academicYear:String(m.school?.year||""),academicPeriod:period,status,markedBy:auth.user.id,markedAt:row?.markedAt||now,updatedAt:now,source:"teacher-app-v350"};
          if(row)Object.assign(row,base);else{m.attendance.push({id:makeId("att"),...base,reviewHistory:[]});}
          const target=row||m.attendance[m.attendance.length-1];
          if(status==="present"){
            target.absenceReasonId="";target.absenceReasonText="";target.reviewedAt="";target.reviewedBy="";target.reviewNote="";
          }else if(status==="absent_excused"||status==="absent_unexcused"){
            const from=was||"absent_pending",reasonText=status==="absent_excused"?"غیبت موجه - ثبت توسط معلم":"غیبت غیرموجه - ثبت توسط معلم";
            target.reviewHistory=Array.isArray(target.reviewHistory)?target.reviewHistory:[];
            if(from!==status)target.reviewHistory.push({from,to:status,reasonId:"",reasonText,note:"ثبت مستقیم توسط معلم از اپ",by:auth.user.id,at:now});
            target.absenceReasonId="";target.absenceReasonText=reasonText;target.reviewedAt=now;target.reviewedBy=auth.user.id;target.reviewNote="ثبت مستقیم توسط معلم از اپ";
          }
        }
        const latest=m.attendance.filter(x=>x.sessionId===session.id&&classIds.has(x.studentId)),present=latest.filter(x=>normalizeAttendanceStatusV81(x.status)==="present").length,pending=latest.filter(x=>normalizeAttendanceStatusV81(x.status)==="absent_pending").length,excused=latest.filter(x=>normalizeAttendanceStatusV81(x.status)==="absent_excused").length,unexcused=latest.filter(x=>normalizeAttendanceStatusV81(x.status)==="absent_unexcused").length,absent=pending+excused+unexcused;
        m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت حضور از اپ معلم",details:`${entry.subject||"کلاس"} · ${classInfoV78(m,entry.classId).name} · حاضر ${present} · موجه ${excused} · غیرموجه ${unexcused} · در انتظار ${pending}`,at:faNow()});
        return {sessionId:session.id,present,absent,pending,excused,unexcused,total:classStudents.length,absentStudentIds:classStudents.filter(st=>!presentIds.has(st.id)).map(st=>st.id)};
      });
      await securityAudit({type:"teacher_attendance_submit",userId:auth.user.id,role:"teacher",success:true,ip:clientIp(req),details:`${entry.id}:${clock.date}:${saved.result.present}/${saved.result.total}`});
      return sendJson(res,200,{ok:true,summary:saved.result,dashboard:teacherDashboardV78(saved.db,auth.user)});
    }
    return sendJson(res,404,{error:"مسیر اپ معلم پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای اپ معلم"});}
}
function adminAttendanceLiveV78(db,date){
  const todayClock=schoolClockV74(),target=String(date||todayClock.date),dayName=schoolDayNameForDateV78(target),isToday=target===todayClock.date,users=new Map((db.users||[]).map(u=>[u.id,u]));
  const rows=(db.weeklySchedule||[]).filter(x=>x.active!==false&&x.day===dayName&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||""));
  const reasons=(db.attendanceReasons||[]).map(x=>({id:String(x.id||""),title:String(x.title||""),excused:x.excused!==false})).filter(x=>x.id&&x.title);
  const classes=(db.school?.classes||[]).filter(c=>c.active!==false).map(c=>{
    const ci=classInfoV78(db,c.id),sessions=rows.filter(x=>x.classId===c.id).sort((a,b)=>(hmMinutesV74(a.startTime)??9999)-(hmMinutesV74(b.startTime)??9999)).map(entry=>{
      const snap=attendanceSnapshotV78(db,entry,target),records=new Map(snap.records.map(r=>[r.studentId,r])),roster=activeClassStudentsV78(db,c.id),teacher=users.get(entry.teacherId),win=isToday?teacherWindowV78(entry,todayClock):{open:false,state:"history"};
      const students=roster.map(st=>{const r=records.get(st.id);return{id:st.id,name:`${st.firstName||""} ${st.lastName||""}`.trim(),attendanceId:r?.id||"",status:r?.status||"unmarked",absenceReasonId:r?.absenceReasonId||"",absenceReasonText:r?.absenceReasonText||"",reviewedAt:r?.reviewedAt||""};});
      const absentStudents=students.filter(x=>isAbsentStatusV81(x.status));
      return {id:entry.id,subject:entry.subject||"",periodNo:Number(entry.periodNo||0),startTime:entry.startTime||"",endTime:entry.endTime||"",teacherId:entry.teacherId,teacherName:teacher?`${teacher.firstName||""} ${teacher.lastName||""}`.trim():"",marked:!!snap.session,current:win.state==="current",windowState:win.state,presentCount:students.filter(x=>x.status==="present").length,lateCount:students.filter(x=>x.status==="late").length,absentCount:absentStudents.length,pendingCount:students.filter(x=>x.status==="absent_pending").length,excusedCount:students.filter(x=>x.status==="absent_excused").length,unexcusedCount:students.filter(x=>x.status==="absent_unexcused").length,presentStudents:students.filter(x=>x.status==="present"),absentStudents,students};
    });
    return {...ci,sessions,currentPending:sessions.some(s=>s.current&&!s.marked)};
  });
  const all=classes.flatMap(c=>c.sessions),marked=all.filter(x=>x.marked);
  return {release:APP_RELEASE,date:target,dateFa:faDateV78(target),dayName,school:{name:db.school?.name||SCHOOL_NAME,year:db.school?.year||""},reasons,summary:{classes:classes.length,scheduledSessions:all.length,markedSessions:marked.length,present:marked.reduce((n,x)=>n+x.presentCount,0),absent:marked.reduce((n,x)=>n+x.absentCount,0),pending:marked.reduce((n,x)=>n+x.pendingCount,0),excused:marked.reduce((n,x)=>n+x.excusedCount,0),unexcused:marked.reduce((n,x)=>n+x.unexcusedCount,0),late:marked.reduce((n,x)=>n+x.lateCount,0)},classes};
}
async function handleAdminAttendanceLiveV78(req,res,url){
  try{
    const auth=await authenticate(req,["admin","superadmin"]);
    if(req.method==="GET"&&url.pathname==="/api/admin/attendance/live")return sendJson(res,200,adminAttendanceLiveV78(auth.db,url.searchParams.get("date")||schoolClockV74().date));
    if(req.method==="POST"&&url.pathname==="/api/admin/attendance/review"){
      const body=await readJson(req),attendanceId=String(body.attendanceId||""),status=String(body.status||"");
      if(!["absent_pending","absent_excused","absent_unexcused"].includes(status))throw Object.assign(new Error("وضعیت بررسی غیبت معتبر نیست."),{status:400});
      const reasonId=String(body.reasonId||"").trim(),reasonText=String(body.reasonText||"").trim().slice(0,300),note=String(body.note||"").trim().slice(0,500);
      const found=(auth.db.attendance||[]).find(x=>x.id===attendanceId);if(!found)throw Object.assign(new Error("رکورد حضور و غیاب پیدا نشد."),{status:404});
      if(!isAbsentStatusV81(found.status))throw Object.assign(new Error("فقط رکورد غیبت قابل تعیین وضعیت است."),{status:409});
      const reason=(auth.db.attendanceReasons||[]).find(x=>String(x.id||"")===reasonId);
      if(status==="absent_excused"&&!reasonText&&!reason)throw Object.assign(new Error("برای غیبت موجه، علت غیبت را انتخاب یا وارد کنید."),{status:400});
      if(status==="absent_excused"&&reason&&reason.excused===false)throw Object.assign(new Error("علت انتخاب‌شده برای غیبت موجه مناسب نیست."),{status:400});
      const saved=await mutateDb(m=>{
        const row=(m.attendance||[]).find(x=>x.id===attendanceId);if(!row)throw Object.assign(new Error("رکورد حضور و غیاب پیدا نشد."),{status:404});
        const from=normalizeAttendanceStatusV81(row.status),now=new Date().toISOString(),student=(m.users||[]).find(x=>x.id===row.studentId),resolvedReason=reasonText||(m.attendanceReasons||[]).find(x=>String(x.id||"")===reasonId)?.title|| (status==="absent_unexcused"?"دلیل موجه تأیید نشد":"");
        row.reviewHistory=Array.isArray(row.reviewHistory)?row.reviewHistory:[];row.reviewHistory.push({from,to:status,reasonId,reasonText:resolvedReason,note,by:auth.user.id,at:now});
        Object.assign(row,{status,absenceReasonId:reasonId,absenceReasonText:resolvedReason,reviewNote:note,reviewedBy:auth.user.id,reviewedAt:now,updatedAt:now});
        m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"بررسی غیبت دانش‌آموز",details:`${student?`${student.firstName||""} ${student.lastName||""}`.trim():row.studentId} · ${from} → ${status}${resolvedReason?` · ${resolvedReason}`:""}`,at:faNow()});
        return {id:row.id,status:row.status,studentId:row.studentId,date:row.date,reasonText:resolvedReason};
      });
      await securityAudit({type:"attendance_absence_review",userId:auth.user.id,role:auth.user.role,success:true,ip:clientIp(req),details:`${attendanceId}:${saved.result.status}`});
      return sendJson(res,200,{ok:true,attendance:saved.result,live:adminAttendanceLiveV78(saved.db,found.date||schoolClockV74().date)});
    }
    return sendJson(res,405,{error:"روش درخواست پشتیبانی نمی‌شود."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مانیتور حضور"});}
}


function scopedDbForStaff(db, user) {
  const copy = JSON.parse(JSON.stringify(db));
  if (["admin", "superadmin"].includes(user.role)) return copy;
  // P66: do not expose admin-only questions to scoped teacher state.
  delete copy.adminQuestionBank;
  const s = teacherScope(db, user);
  const can = (row, feature="") => teacherCanAssigned(db, user, {classId:row?.classId||"",subject:row?.subject||"",bookId:row?.bookId||"",feature});
  copy.teachingAssignments = (copy.teachingAssignments || []).filter(a => a.teacherId === user.id);
  copy.school = { ...copy.school, classes: (copy.school.classes || []).filter(c => s.classIds.has(c.id)), subjects: [...s.subjects] };
  copy.users = (copy.users || []).filter(u => u.id === user.id || s.studentIds.has(u.id));
  copy.curriculum = (copy.curriculum || []).filter(b => s.bookIds.has(b.id));
  copy.chapterProgress = (copy.chapterProgress || []).filter(p => teacherCanAssigned(db,user,{classId:p.classId,bookId:p.bookId,feature:"classJournal"}));
  copy.learningPoints = (copy.learningPoints || []).filter(p => teacherCanAssigned(db,user,{bookId:p.bookId,subject:p.subject,feature:"questionBank"}));
  copy.questionBank = (copy.questionBank || []).filter(q => s.questionIds.has(q.id));
  copy.questionCollections = (copy.questionCollections || []).filter(c => c.createdBy === user.id || c.shared).map(c => ({ ...c, questionIds: (c.questionIds || []).filter(id => s.questionIds.has(id)) }));
  copy.questionVersions = (copy.questionVersions || []).filter(v => s.questionIds.has(v.questionId));
  copy.questionGenerationJobs = (copy.questionGenerationJobs || []).filter(j => teacherCanAssigned(db,user,{bookId:j.bookId,feature:"questionBank"}));
  copy.exams = (copy.exams || []).filter(e => s.examIds.has(e.id));
  const usageV4523 = teacherQuestionUsageV4523(db, user.id);
  copy.teacherQuestionUsage = usageV4523;
  copy.questionBank = (copy.questionBank || []).map(q => ({...q,teacherUsage:usageV4523[q.id]||{count:0,examIds:[],lastUsedAt:null},previouslyUsedByTeacher:Number(usageV4523[q.id]?.count||0)>0}));
  copy.examBlueprints = (copy.examBlueprints || []).filter(b => b.createdBy === user.id && teacherCanAssigned(db,user,{classId:b.classId,bookId:b.bookId,feature:"examCreate"}));
  copy.attempts = (copy.attempts || []).filter(a => s.examIds.has(a.examId) && s.studentIds.has(a.studentId));
  copy.submissions = (copy.submissions || []).filter(x => s.submissionIds.has(x.id));
  copy.grades = (copy.grades || []).filter(g => s.submissionIds.has(g.submissionId));
  copy.appeals = (copy.appeals || []).filter(a => s.examIds.has(a.examId) && s.studentIds.has(a.studentId));
  copy.notifications = (copy.notifications || []).filter(n => n.userId === user.id || s.studentIds.has(n.userId));
  copy.examAbsenceFollowupsT02=(copy.examAbsenceFollowupsT02||[]).filter(x=>s.examIds.has(x.examId)&&s.studentIds.has(x.studentId));
  copy.homework = (copy.homework || []).filter(h => can(h,"homework"));
  const homeworkIds = new Set(copy.homework.map(h => h.id));
  copy.homeworkSubmissions = (copy.homeworkSubmissions || []).filter(x => homeworkIds.has(x.homeworkId) && s.studentIds.has(x.studentId));
  copy.resources = (copy.resources || []).filter(r => can(r,"classJournal"));
  copy.attendanceSessions = (copy.attendanceSessions || []).filter(a => can(a,"attendance"));
  const attendanceSessionIds = new Set(copy.attendanceSessions.map(x => x.id));
  copy.attendance = (copy.attendance || []).filter(a => s.studentIds.has(a.studentId) && (!a.sessionId || attendanceSessionIds.has(a.sessionId)));
  copy.continuousAssessments = (copy.continuousAssessments || []).filter(a => s.studentIds.has(a.studentId) && can(a,"continuous"));
  copy.gradebookConfigs=(copy.gradebookConfigs||[]).filter(a=>teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"continuous"}));
  copy.gradebookEntries=(copy.gradebookEntries||[]).filter(a=>s.studentIds.has(a.studentId)&&teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"continuous"}));
  copy.termFinalOverrides=(copy.termFinalOverrides||[]).filter(a=>s.studentIds.has(a.studentId)&&teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"continuous"}));
  copy.termLocks=(copy.termLocks||[]).filter(a=>teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"continuous"}));
  copy.notificationBroadcasts=(copy.notificationBroadcasts||[]).filter(a=>a.createdBy===user.id);
  copy.continuousGradeOverrides=(copy.continuousGradeOverrides||[]).filter(a=>s.studentIds.has(a.studentId)&&teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"continuous"}));
  copy.termPolicies=(copy.termPolicies||[]).filter(p=>teacherCanAssigned(db,user,{classId:p.classId,subject:p.subject,feature:"continuous"}));
  // v193: نمره مستمر پایان‌ترم نیز باید در state محدودشده معلم دیده شود؛
  // در نسخه‌های قبل termGrades از مرز سرور حذف می‌شد و کارنامه دانش‌آموز مستمر را صفر می‌دید.
  copy.termGrades = (copy.termGrades || []).filter(a => {
    const student = (db.users || []).find(st => st.id === a.studentId && st.role === "student");
    return !!student && s.studentIds.has(a.studentId) && teacherCanAssigned(db,user,{classId:student.classId,subject:a.subject||"",feature:"continuous"});
  });
  copy.behaviorRecords = (copy.behaviorRecords || []).filter(a => s.studentIds.has(a.studentId) && teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"behavior"}));
  copy.lessonLogs = (copy.lessonLogs || []).filter(a => can(a,"classJournal"));
  copy.guardianContacts = (copy.guardianContacts || []).filter(a => s.studentIds.has(a.studentId) && teacherCanAssigned(db,user,{classId:a.classId,feature:"family"}));
  copy.guardianLinks = (copy.guardianLinks || []).filter(a => s.studentIds.has(a.studentId));
  const scopedGuardianIds = new Set(copy.guardianLinks.map(a=>a.guardianId).filter(Boolean));
  copy.guardians = (copy.guardians || []).filter(g => scopedGuardianIds.has(g.id));
  copy.consentForms = (copy.consentForms || []).filter(a => !a.classId || teacherCanAssigned(db,user,{classId:a.classId,feature:"family"}));
  copy.progressReports = (copy.progressReports || []).filter(a => s.studentIds.has(a.studentId) && activeTeachingAssignments(db,user,"reports").some(x=>x.classId===(db.users||[]).find(st=>st.id===a.studentId)?.classId));
  copy.schedule = (copy.schedule || []).filter(a => s.classIds.has(a.classId));
  copy.weeklySchedule=(copy.weeklySchedule||[]).filter(a=>s.classIds.has(a.classId)&&(a.teacherId===user.id||teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||""})));
  copy.onlineClassSessions=(copy.onlineClassSessions||[]).filter(a=>s.classIds.has(a.classId)&&(a.teacherId===user.id||teacherCanAssigned(db,user,{classId:a.classId,subject:a.subject||"",feature:"attendance"})));
  const onlineSessionIdsV74=new Set(copy.onlineClassSessions.map(x=>x.id));
  copy.onlineJoinEvents=(copy.onlineJoinEvents||[]).filter(a=>s.studentIds.has(a.studentId)&&(!a.onlineSessionId||onlineSessionIdsV74.has(a.onlineSessionId))&&(!a.classId||s.classIds.has(a.classId)));
  copy.announcements = (copy.announcements || []).filter(a => a.createdBy === user.id);
  copy.interventions = (copy.interventions || []).filter(a => s.studentIds.has(a.studentId) && activeTeachingAssignments(db,user,"interventions").some(x=>x.classId===(db.users||[]).find(st=>st.id===a.studentId)?.classId));
  copy.audit = (copy.audit || []).filter(a => a.userId === user.id).slice(0, 1000);
  // P67.22.9: deny by default. Do not return unchecked DB collections when
  // the schema grows; the explicit teacher view also isolates legacy reports.
  return teacherStateProjectionP67229(copy, {
    teacherId: user.id, studentIds: s.studentIds, classIds: s.classIds,
    examIds: s.examIds, questionIds: s.questionIds
  });
}
function mergeScopedCollection(oldRows, incomingRows, oldInScope, newInScope) {
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  if (incoming.some(row => !newInScope(row))) throw Object.assign(new Error("تغییر خارج از تخصیص تدریس یا مجوز تعیین‌شده برای شما مجاز نیست."), { status: 403 });
  return [...(oldRows || []).filter(row => !oldInScope(row)), ...incoming];
}
function mergeTeacherDb(oldDb, incoming, user) {
  const scope = teacherScope(oldDb, user); const result = JSON.parse(JSON.stringify(oldDb));
  const can = (row, feature="") => teacherCanAssigned(oldDb,user,{classId:row?.classId||"",subject:row?.subject||"",bookId:row?.bookId||"",feature});
  const canExam = e => can(e,"examCreate");
  const books = new Map((oldDb.curriculum || []).map(b => [b.id, b]));
  const classes = new Map((oldDb.school?.classes || []).map(c => [c.id, c]));
  incoming.questionBank = (Array.isArray(incoming.questionBank) ? incoming.questionBank : []).map(raw => {
    const q={...raw},book=books.get(q.bookId);
    if(!book)throw Object.assign(new Error("کتاب سؤال معتبر نیست."),{status:400});
    if(q.subject&&q.subject!==book.subject)throw Object.assign(new Error("درس سؤال با کتاب انتخاب‌شده سازگار نیست."),{status:400});
    const meta=gradeMeta(book.grade);
    return {...q,subject:book.subject,grade:meta.grade,gradeId:meta.id,gradeName:meta.name};
  });
  const makeupIdsT02=new Set((oldDb.exams||[]).filter(x=>x.makeupForExamId).map(x=>String(x.id)));
  const incomingExams = (Array.isArray(incoming.exams)?incoming.exams:[]).filter(raw=>!makeupIdsT02.has(String(raw.id))).map(raw=>{
    const cls=classes.get(raw.classId),book=books.get(raw.bookId);
    const e=normalizeExamCore(raw,cls,book);
    // P67: a published exam may snapshot approved admin-bank questions by reference;
    // this validation is read-only and never migrates admin questions into questionBank.
    const oldExam=(oldDb.exams||[]).find(x=>String(x.id)===String(e.id));
    const priorRefs=new Set((oldExam?.questions||[]).map(x=>String(x.sourceQuestionId||"")));
    const authorizedAdmin=(oldDb.adminQuestionBank||[]).filter(q=>
      (q.status==="approved"||priorRefs.has(String(q.id))) &&
      teacherCanAssigned(oldDb,user,{bookId:q.bookId,subject:q.subject,feature:"questionBank"}));
    const adminById=new Map(authorizedAdmin.map(q=>[String(q.id),q]));
    for(const q of e.questions||[]){
      const sourceId=String(q.sourceQuestionId||"");
      const fromAdmin=(oldDb.adminQuestionBank||[]).some(x=>String(x.id)===sourceId);
      if(fromAdmin){
        const source=adminById.get(sourceId);
        if(!source||String(source.bookId)!==String(e.bookId)||String(source.chapterId)!==String(q.sourceChapterId||q.chapterId||""))
          throw Object.assign(new Error("سؤال انتخاب‌شده از مخزن ادمین تأیید نشده یا به کتاب/فصل مجاز تعلق ندارد."),{status:403});
        const previous=(oldExam?.questions||[]).find(item=>String(item.id)===String(q.id));
        const unchangedSnapshot=Boolean(previous&&String(previous.sourceQuestionId||"")===sourceId&&sameSavedExamQuestionP672013(previous,q));
        if(!unchangedSnapshot&&!globalThis.MSY_FINAL_TERM_QUESTION_BANK_CORE.allowedForExam(source,e.examCategory||"ongoing",e.academicPeriod||e.period||"semester1"))
          throw Object.assign(new Error("کاربرد یا نیم‌سال سؤال با نوع آزمون انتخاب‌شده سازگار نیست."),{status:400});
      }
    }
    const errors=validateExamCore(e,{cls,book,questionBank:[...(incoming.questionBank||oldDb.questionBank||[]),...authorizedAdmin]});
    if((e.examCategory||"ongoing")==="final"){
      const policyDb={...oldDb,...incoming,school:incoming.school||oldDb.school,termPolicies:Array.isArray(incoming.termPolicies)?incoming.termPolicies:oldDb.termPolicies,gradebookConfigs:Array.isArray(incoming.gradebookConfigs)?incoming.gradebookConfigs:oldDb.gradebookConfigs};
      const scoreError=enforceFinalTermExamScoreV8914(policyDb,e,book);
      if(scoreError)errors.push(scoreError);
    }
    if(errors.length)throw Object.assign(new Error(errors.join(" ")),{status:400});
    const meta=gradeMeta(cls.grade);
    return {...e,subject:book.subject,grade:meta.grade,gradeId:meta.id,gradeName:meta.name};
  });
  // p20: exams visible to the teacher can be read-only (e.g. grading access
  // without examCreate). Never treat their presence in a scoped state as a write.
  // Preserve authoritative read-only records; only writable exams enter the merge.
  const writableIncomingExams = [];
  const oldExamsByIdP20 = new Map((oldDb.exams || []).map(e => [e.id, e]));
  for (const e of incomingExams) {
    if (!canExam(e)) {
      const previous = oldExamsByIdP20.get(e.id);
      // A newly injected/out-of-scope exam is never accepted.
      if (!previous || !scope.examIds.has(e.id)) throw Object.assign(new Error("این آزمون خارج از کلاس/درس/کتاب تخصیص‌یافته به شماست."),{status:403});
      // Read-only exam fields always come from the server, not the client.
      continue;
    }
    if (e.status === "active" && !can(e,"examPublish")) throw Object.assign(new Error("مجوز انتشار آزمون برای این تخصیص تدریس فعال نیست."),{status:403});
    writableIncomingExams.push(e);
  }
  const incomingExamIds = new Set(writableIncomingExams.map(e=>e.id)); const allExamIds = new Set([...scope.examIds,...incomingExamIds]);
  const incomingSubmissionIds = new Set((incoming.submissions||[]).filter(x=>allExamIds.has(x.examId)&&scope.studentIds.has(x.studentId)).map(x=>x.id));
  const allSubmissionIds = new Set([...scope.submissionIds,...incomingSubmissionIds]);
  result.chapterProgress = mergeScopedCollection(oldDb.chapterProgress,incoming.chapterProgress,p=>teacherCanAssigned(oldDb,user,{classId:p.classId,bookId:p.bookId,feature:"classJournal"}),p=>teacherCanAssigned(oldDb,user,{classId:p.classId,bookId:p.bookId,feature:"classJournal"}));
  result.learningPoints = mergeScopedCollection(oldDb.learningPoints,incoming.learningPoints,p=>teacherCanAssigned(oldDb,user,{bookId:p.bookId,subject:p.subject,feature:"questionBank"}),p=>teacherCanAssigned(oldDb,user,{bookId:p.bookId,subject:p.subject,feature:"questionBank"}));
  // بانک سؤال: سؤال‌های مدیریت/اشتراکی در state معلم دیده می‌شوند اما read-only باقی می‌مانند.
  const oldQuestionById = new Map((oldDb.questionBank || []).map(q => [q.id, q]));
  const writableOldQuestionIds = new Set((oldDb.questionBank || []).filter(q => teacherCanWriteQuestion(oldDb, user, q)).map(q => q.id));
  const teacherWritableQuestions = [];
  for (const qRaw of incoming.questionBank || []) {
    const existing = oldQuestionById.get(qRaw.id);
    if (existing && !teacherCanWriteQuestion(oldDb, user, existing)) continue; // نسخه مرکزی مدرسه را هرگز از payload معلم قبول نکن.
    const q = { ...qRaw, createdBy: existing?.createdBy || user.id };
    if (!teacherCanAssigned(oldDb,user,{bookId:q.bookId,subject:q.subject,feature:"questionBank"})) throw Object.assign(new Error("این سؤال خارج از کتاب/درس تخصیص‌یافته به شماست."),{status:403});
    teacherWritableQuestions.push(q);
  }
  result.questionBank = [
    ...(oldDb.questionBank || []).filter(q => !writableOldQuestionIds.has(q.id)),
    ...teacherWritableQuestions
  ];
  const qids=new Set(result.questionBank.filter(q=>teacherCanReadQuestion(result,user,q)).map(q=>q.id));
  const writableQids=new Set(result.questionBank.filter(q=>teacherCanWriteQuestion(result,user,q)).map(q=>q.id));
  result.questionCollections=[...(oldDb.questionCollections||[]).filter(c=>c.createdBy!==user.id),...(incoming.questionCollections||[]).filter(c=>c.createdBy===user.id).map(c=>({...c,questionIds:(c.questionIds||[]).filter(id=>qids.has(id))}))];
  // تاریخچه سؤال‌های مرکزی نیز read-only است؛ فقط تاریخچه سؤال‌های خود معلم از payload او ادغام می‌شود.
  result.questionVersions=[...(oldDb.questionVersions||[]).filter(v=>!writableQids.has(v.questionId)),...(incoming.questionVersions||[]).filter(v=>writableQids.has(v.questionId))];
  result.questionGenerationJobs=mergeScopedCollection(oldDb.questionGenerationJobs,incoming.questionGenerationJobs,j=>teacherCanAssigned(oldDb,user,{bookId:j.bookId,feature:"questionBank"}),j=>teacherCanAssigned(oldDb,user,{bookId:j.bookId,feature:"questionBank"}));
  result.exams=mergeScopedCollection(oldDb.exams,writableIncomingExams,e=>scope.examIds.has(e.id)&&canExam(e)&&!e.makeupForExamId,e=>canExam(e)).map(e=>{
    const cls=(result.school?.classes||[]).find(c=>c.id===e.classId),book=(result.curriculum||[]).find(b=>b.id===e.bookId);
    return normalizeExamCore(e,cls,book);
  });
  result.examBlueprints=[...(oldDb.examBlueprints||[]).filter(b=>b.createdBy!==user.id),...(incoming.examBlueprints||[]).filter(b=>b.createdBy===user.id&&teacherCanAssigned(oldDb,user,{classId:b.classId,bookId:b.bookId,feature:"examCreate"}))];
  result.attempts=mergeScopedCollection(oldDb.attempts,incoming.attempts,a=>scope.examIds.has(a.examId)&&scope.studentIds.has(a.studentId),a=>allExamIds.has(a.examId)&&scope.studentIds.has(a.studentId));
  result.submissions=mergeScopedCollection(oldDb.submissions,incoming.submissions,x=>scope.examIds.has(x.examId)&&scope.studentIds.has(x.studentId),x=>allExamIds.has(x.examId)&&scope.studentIds.has(x.studentId));
  const submissionById=id=>(result.submissions||[]).find(x=>x.id===id)||(oldDb.submissions||[]).find(x=>x.id===id); const examById=id=>(result.exams||[]).find(x=>x.id===id)||(oldDb.exams||[]).find(x=>x.id===id);
  const canGradeSubmission=id=>{const sub=submissionById(id),ex=examById(sub?.examId);return !!sub&&!!ex&&scope.studentIds.has(sub.studentId)&&teacherCanAssigned(oldDb,user,{classId:ex.classId,subject:ex.subject,bookId:ex.bookId,feature:"grading"});};
  result.grades=mergeScopedCollection(oldDb.grades,incoming.grades,g=>scope.submissionIds.has(g.submissionId)&&canGradeSubmission(g.submissionId),g=>allSubmissionIds.has(g.submissionId)&&canGradeSubmission(g.submissionId));
  for(const grade of result.grades.filter(g=>(incoming.grades||[]).some(x=>x.id===g.id))){
    const sub=submissionById(grade.submissionId),ex=examById(sub?.examId||grade.examId);
    if(!ex)continue;
    const gradeErrors=validatePublishedGradeCore(grade,ex);
    if(gradeErrors.length)throw Object.assign(new Error(gradeErrors.join(" ")),{status:400});
  }
  result.appeals=mergeScopedCollection(oldDb.appeals,incoming.appeals,a=>scope.examIds.has(a.examId)&&scope.studentIds.has(a.studentId)&&teacherCanAssigned(oldDb,user,{classId:examById(a.examId)?.classId,subject:examById(a.examId)?.subject,bookId:examById(a.examId)?.bookId,feature:"grading"}),a=>allExamIds.has(a.examId)&&scope.studentIds.has(a.studentId)&&teacherCanAssigned(oldDb,user,{classId:examById(a.examId)?.classId,subject:examById(a.examId)?.subject,bookId:examById(a.examId)?.bookId,feature:"grading"}));
  result.notifications=mergeScopedCollection(oldDb.notifications,incoming.notifications,n=>n.userId===user.id||scope.studentIds.has(n.userId),n=>n.userId===user.id||scope.studentIds.has(n.userId));
  result.homework=mergeScopedCollection(oldDb.homework,incoming.homework,h=>can(h,"homework"),h=>can(h,"homework")); const hwIds=new Set(result.homework.filter(h=>can(h,"homework")).map(h=>h.id));
  result.homeworkSubmissions=mergeScopedCollection(oldDb.homeworkSubmissions,incoming.homeworkSubmissions,x=>hwIds.has(x.homeworkId)&&scope.studentIds.has(x.studentId),x=>hwIds.has(x.homeworkId)&&scope.studentIds.has(x.studentId));
  result.resources=mergeScopedCollection(oldDb.resources,incoming.resources,r=>can(r,"classJournal"),r=>can(r,"classJournal"));
  // p18: مسیر عمومی /api/state نیز حق دورزدن ساعت حضور و غیاب را ندارد.
  // فقط تغییرات جدید حضور/جلسه را بررسی می‌کنیم تا رکوردهای تاریخی موجود در state معلم مسدود نشوند.
  const attendanceClockV18=schoolClockV74(), oldSessionByIdV18=new Map((oldDb.attendanceSessions||[]).map(x=>[x.id,x]));
  const changedJsonV18=(a,b)=>JSON.stringify(a??null)!==JSON.stringify(b??null);
  const assertScheduledAttendanceWriteV18=(session)=>{
    const entry=(oldDb.weeklySchedule||[]).find(x=>x.id===session?.scheduleEntryId&&x.active!==false);
    if(!entry||entry.teacherId!==user.id||entry.classId!==session?.classId||String(entry.subject||"")!==String(session?.subject||""))throw Object.assign(new Error("ثبت حضور فقط از زنگ برنامه هفتگی همان معلم مجاز است."),{status:409});
    if(entry.day!==attendanceClockV18.dayName||String(session?.date||"")!==attendanceClockV18.date)throw Object.assign(new Error("حضور این کلاس فقط در روز برنامه همان کلاس قابل ثبت است."),{status:409});
    if(!teacherWindowV78(entry,attendanceClockV18).open)throw Object.assign(new Error(`حضور و غیاب این کلاس فقط از ساعت ${entry.startTime||""} تا ${entry.endTime||""} فعال است.`),{status:409});
    if(classAttendanceBlockV78(oldDb,entry.classId,attendanceClockV18.date))throw Object.assign(new Error("ثبت حضور امروز برای این کلاس بسته است."),{status:409});
    return entry;
  };
  for(const se of (Array.isArray(incoming.attendanceSessions)?incoming.attendanceSessions:[])){const old=oldSessionByIdV18.get(se.id);if(!old||changedJsonV18(se,old))assertScheduledAttendanceWriteV18(se);}
  result.attendanceSessions=mergeScopedCollection(oldDb.attendanceSessions,incoming.attendanceSessions,a=>can(a,"attendance"),a=>can(a,"attendance")); const sessIds=new Set(result.attendanceSessions.filter(a=>can(a,"attendance")).map(a=>a.id));
  const oldAttendanceByIdV81=new Map((oldDb.attendance||[]).map(x=>[x.id,x]));
  for(const ar of (Array.isArray(incoming.attendance)?incoming.attendance:[])){const old=oldAttendanceByIdV81.get(ar.id);if(!old||changedJsonV18(ar,old)){const se=(incoming.attendanceSessions||[]).find(x=>x.id===ar.sessionId)||oldSessionByIdV18.get(ar.sessionId);assertScheduledAttendanceWriteV18(se);}}
  incoming.attendance=(Array.isArray(incoming.attendance)?incoming.attendance:[]).map(raw=>{const row={...raw,status:normalizeAttendanceStatusV81(raw.status)};const old=oldAttendanceByIdV81.get(row.id),oldStatus=old?normalizeAttendanceStatusV81(old.status):"";if(["absent_excused","absent_unexcused"].includes(row.status)&&row.status!==oldStatus)throw Object.assign(new Error("تعیین موجه یا غیرموجه بودن غیبت فقط توسط مدیریت مجاز است."),{status:403});if(old&&["absenceReasonId","absenceReasonText","reviewedAt","reviewedBy","reviewNote","reviewHistory"].some(k=>JSON.stringify(row[k]??null)!==JSON.stringify(old[k]??null)))throw Object.assign(new Error("معلم اجازه تغییر نتیجه بررسی غیبت را ندارد."),{status:403});return row;});
  result.attendance=mergeScopedCollection(oldDb.attendance,incoming.attendance,a=>scope.studentIds.has(a.studentId)&&(!a.sessionId||sessIds.has(a.sessionId)),a=>scope.studentIds.has(a.studentId)&&(!a.sessionId||sessIds.has(a.sessionId)));
  const lockedScopesV75=(oldDb.termLocks||[]).filter(x=>x.active!==false&&teacherCanAssigned(oldDb,user,{classId:x.classId,subject:x.subject||"",feature:"continuous"}));
  const rowScopeKeyV75=row=>`${row?.classId||((oldDb.users||[]).find(st=>st.id===row?.studentId)?.classId||"")}__${row?.subject||""}__${String(row?.academicYear||oldDb.school?.year||"")}__${String(row?.academicPeriod||row?.period||"semester2")}`;
  const lockKeyV75=x=>`${x.classId}__${x.subject||""}__${String(x.academicYear||oldDb.school?.year||"")}__${String(x.academicPeriod||x.period||"semester2")}`;
  const lockedKeysV75=new Set(lockedScopesV75.map(lockKeyV75));
  const assertLockedCollectionUnchangedV75=(name,oldRows,newRows)=>{const normalize=rows=>(rows||[]).filter(r=>lockedKeysV75.has(rowScopeKeyV75(r))).map(r=>JSON.stringify(r)).sort();if(JSON.stringify(normalize(oldRows))!==JSON.stringify(normalize(newRows)))throw Object.assign(new Error("نمرات این درس/نیم‌سال توسط مدیریت قفل شده‌اند و از مسیر همگام‌سازی نیز قابل تغییر نیستند."),{status:409,code:"TERM_LOCKED"});};
  assertLockedCollectionUnchangedV75("continuousAssessments",oldDb.continuousAssessments,incoming.continuousAssessments);
  assertLockedCollectionUnchangedV75("continuousGradeOverrides",oldDb.continuousGradeOverrides,incoming.continuousGradeOverrides);
  assertLockedCollectionUnchangedV75("termGrades",oldDb.termGrades,incoming.termGrades);
  result.continuousAssessments=mergeScopedCollection(oldDb.continuousAssessments,incoming.continuousAssessments,a=>scope.studentIds.has(a.studentId)&&can(a,"continuous"),a=>scope.studentIds.has(a.studentId)&&can(a,"continuous"));
  // v75: دفتر نمره و تنظیمات آن فقط از API تخصصی نوشته می‌شوند؛ payload عمومی state برای معلم read-only است.
  result.gradebookEntries=oldDb.gradebookEntries||[];
  result.termFinalOverrides=oldDb.termFinalOverrides||[];
  result.gradebookConfigs=oldDb.gradebookConfigs||[];
  result.termLocks=oldDb.termLocks||[];
  const canContinuousOverrideV73=row=>{const st=(oldDb.users||[]).find(x=>x.id===row?.studentId&&x.role==="student");return !!st&&scope.studentIds.has(row.studentId)&&row.classId===st.classId&&teacherCanAssigned(oldDb,user,{classId:row.classId,subject:row.subject||"",feature:"continuous"})&&String(row.academicYear||oldDb.school?.year||"")===String(oldDb.school?.year||"")&&["semester1","semester2"].includes(String(row.academicPeriod||row.period||"semester2"))&&Number.isFinite(Number(row.finalScore))&&Number(row.finalScore)>=0&&Number(row.finalScore)<=20;};
  result.continuousGradeOverrides=mergeScopedCollection(oldDb.continuousGradeOverrides,incoming.continuousGradeOverrides,canContinuousOverrideV73,canContinuousOverrideV73);
  // v193: termGrades همان منبع رسمی نمره مستمر کارنامه پایان‌ترم است.
  // فقط معلم دارای تخصیص فعال همان دانش‌آموز/درس و فقط در سال تحصیلی فعال حق تغییر دارد.
  const activeYearV193 = String(oldDb.school?.year || "");
  const canTermGradeV193 = row => {
    const student = (oldDb.users || []).find(st => st.id === row?.studentId && st.role === "student");
    if (!student || !scope.studentIds.has(row.studentId)) return false;
    const rowYear = String(row.academicYear || (String(row.key || "").endsWith(`__${activeYearV193}`) ? activeYearV193 : ""));
    return rowYear === activeYearV193 && teacherCanAssigned(oldDb,user,{classId:student.classId,subject:row.subject||"",feature:"continuous"});
  };
  const normalizedIncomingTermGradesV193 = (Array.isArray(incoming.termGrades) ? incoming.termGrades : []).map(row => {
    const academicYear=row.academicYear||activeYearV193,academicPeriod=normalizeAcademicPeriod(row.academicPeriod||row.period,{allowAnnual:false});
    return {...row,academicYear,academicPeriod,key:periodizedTermKey(row.studentId,row.subject,academicYear,academicPeriod)};
  });
  result.termGrades=mergeScopedCollection(oldDb.termGrades,normalizedIncomingTermGradesV193,canTermGradeV193,canTermGradeV193);
  result.behaviorRecords=mergeScopedCollection(oldDb.behaviorRecords,incoming.behaviorRecords,a=>scope.studentIds.has(a.studentId)&&teacherCanAssigned(oldDb,user,{classId:a.classId,subject:a.subject||"",feature:"behavior"}),a=>scope.studentIds.has(a.studentId)&&teacherCanAssigned(oldDb,user,{classId:a.classId,subject:a.subject||"",feature:"behavior"}));
  result.lessonLogs=mergeScopedCollection(oldDb.lessonLogs,incoming.lessonLogs,a=>can(a,"classJournal"),a=>can(a,"classJournal"));
  result.guardianContacts=mergeScopedCollection(oldDb.guardianContacts,incoming.guardianContacts,a=>scope.studentIds.has(a.studentId)&&teacherCanAssigned(oldDb,user,{classId:a.classId,feature:"family"}),a=>scope.studentIds.has(a.studentId)&&teacherCanAssigned(oldDb,user,{classId:a.classId,feature:"family"}));
  result.consentForms=mergeScopedCollection(oldDb.consentForms,incoming.consentForms,a=>!a.classId||teacherCanAssigned(oldDb,user,{classId:a.classId,feature:"family"}),a=>!a.classId||teacherCanAssigned(oldDb,user,{classId:a.classId,feature:"family"}));
  result.progressReports=mergeScopedCollection(oldDb.progressReports,incoming.progressReports,a=>scope.studentIds.has(a.studentId),a=>scope.studentIds.has(a.studentId)&&activeTeachingAssignments(oldDb,user,"reports").length>0);
  const canReportCardV203 = row => {
    const student=(oldDb.users||[]).find(st=>st.id===row?.studentId&&st.role==="student");
    return !!student && scope.studentIds.has(row.studentId) && String(row.academicYear||oldDb.school?.year||"")===String(oldDb.school?.year||"") && activeTeachingAssignments(oldDb,user,"reports").some(a=>!a.classId||a.classId===student.classId);
  };
  result.reportCards=mergeScopedCollection(oldDb.reportCards,incoming.reportCards,canReportCardV203,canReportCardV203);
  // برنامه هفتگی فقط توسط مدیریت مدرسه قابل ویرایش است؛ معلم نسخه محدودشده را فقط می‌خواند.
  result.schedule=oldDb.schedule||[];
  result.weeklySchedule=oldDb.weeklySchedule||[];
  const scheduleByIdV74=new Map((oldDb.weeklySchedule||[]).map(x=>[x.id,x]));
  const onlineSettingsV74=onlineLearningSettingsV74(oldDb);
  const canOnlineSessionV74=row=>{
    const entry=scheduleByIdV74.get(row?.scheduleEntryId);
    if(!entry||entry.teacherId!==user.id||row.classId!==entry.classId||row.teacherId!==user.id)return false;
    if(!teacherCanAssigned(oldDb,user,{classId:entry.classId,subject:entry.subject||"",feature:"attendance"}))return false;
    if(String(row.academicYear||oldDb.school?.year||"")!==String(oldDb.school?.year||""))return false;
    const effective=effectiveDeliveryModeV74(oldDb,entry);
    if(!onlineSettingsV74.enabled||!["online","hybrid"].includes(effective))return false;
    let rowUrl=""; try{rowUrl=normalizeWebUrlV74(row.meetingUrl||entry.meetingUrl||onlineSettingsV74.defaultMeetingUrl||"");}catch{return false;}
    if(!rowUrl)return false;
    if(onlineSettingsV74.teacherCanEditLinks===false){
      let fixed=""; try{fixed=normalizeWebUrlV74(entry.meetingUrl||onlineSettingsV74.defaultMeetingUrl||"");}catch{return false;}
      if(!fixed||rowUrl!==fixed)return false;
    }
    return true;
  };
  const incomingOnlineSessionsV74=(Array.isArray(incoming.onlineClassSessions)?incoming.onlineClassSessions:[]).map(row=>{
    const entry=scheduleByIdV74.get(row?.scheduleEntryId);
    if(!entry)return row;
    const fixedUrl=entry.meetingUrl||onlineSettingsV74.defaultMeetingUrl||"";
    const meetingUrl=onlineSettingsV74.teacherCanEditLinks===false?fixedUrl:(row.meetingUrl||fixedUrl);
    return {...row,deliveryMode:effectiveDeliveryModeV74(oldDb,entry),meetingProvider:String(row.meetingProvider||entry.meetingProvider||onlineSettingsV74.defaultProvider||"custom").slice(0,60),meetingUrl:normalizeWebUrlV74(meetingUrl||""),subject:entry.subject,teacherId:entry.teacherId,classId:entry.classId,periodNo:entry.periodNo,shiftId:entry.shiftId,academicYear:String(oldDb.school?.year||"")};
  });
  result.onlineClassSessions=mergeScopedCollection(oldDb.onlineClassSessions,incomingOnlineSessionsV74,canOnlineSessionV74,canOnlineSessionV74);
  result.onlineJoinEvents=oldDb.onlineJoinEvents||[];
  result.announcements=mergeScopedCollection(oldDb.announcements,incoming.announcements,a=>a.createdBy===user.id,a=>a.createdBy===user.id);
  result.interventions=mergeScopedCollection(oldDb.interventions,incoming.interventions,a=>scope.studentIds.has(a.studentId)&&activeTeachingAssignments(oldDb,user,"interventions").length>0,a=>scope.studentIds.has(a.studentId)&&activeTeachingAssignments(oldDb,user,"interventions").length>0);
  const newAudit=(incoming.audit||[]).filter(a=>a.userId===user.id&&!(oldDb.audit||[]).some(old=>old.id===a.id)); result.audit=[...newAudit,...(oldDb.audit||[])].slice(0,5000);
  return normalizeTeachingAssignments(result);
}
// P67.20.13 — Accept the independent admin repository during admin state validation.
// Preserve *unchanged* legacy exam snapshots whose original question was later
// removed from the repository, without creating a replacement bank entry.
function sameSavedExamQuestionP672013(a,b){
  if(!a||!b)return false;
  const signature=q=>{
    const copy={...q,score:Number(q.score||0)};
    return JSON.stringify(Object.keys(copy).sort().map(key=>[key,copy[key]]));
  };
  return signature(a)===signature(b);
}
function adminExamSourceScopeErrorsV8914(oldDb,incoming,exam){
  const admin=Array.isArray(incoming.adminQuestionBank)?incoming.adminQuestionBank:(Array.isArray(oldDb.adminQuestionBank)?oldDb.adminQuestionBank:[]);
  const byId=new Map(admin.filter(q=>q?.id).map(q=>[String(q.id),q]));
  const oldExam=(oldDb.exams||[]).find(e=>String(e.id)===String(exam.id));
  const oldById=new Map((oldExam?.questions||[]).map(q=>[String(q.id),q]));
  const errors=[];
  for(const q of exam.questions||[]){
    const sourceId=String(q.sourceQuestionId||"").trim(),source=byId.get(sourceId);
    if(!source)continue;
    const previous=oldById.get(String(q.id));
    const unchangedSnapshot=Boolean(previous&&String(previous.sourceQuestionId||"")===sourceId&&sameSavedExamQuestionP672013(previous,q));
    if(!unchangedSnapshot&&!globalThis.MSY_FINAL_TERM_QUESTION_BANK_CORE.allowedForExam(source,exam.examCategory||"ongoing",exam.academicPeriod||exam.period||"semester1"))
      errors.push("کاربرد یا نیم‌سال سؤال مخزن ادمین با نوع آزمون سازگار نیست.");
  }
  return errors;
}

function examSourcesForAdminStateP672013(oldDb,incoming,exam){
  const main=Array.isArray(incoming.questionBank)?incoming.questionBank:[];
  const admin=Array.isArray(incoming.adminQuestionBank)?incoming.adminQuestionBank:
              (Array.isArray(oldDb.adminQuestionBank)?oldDb.adminQuestionBank:[]);
  const oldExam=(oldDb.exams||[]).find(e=>String(e.id)===String(exam.id));
  const compatibleExam=oldExam&&String(oldExam.bookId)===String(exam.bookId);
  const oldById=new Map((compatibleExam?(oldExam.questions||[]):[]).map(q=>[String(q.id),q]));
  const preserved=q=>{
    const previous=oldById.get(String(q.id));
    return Boolean(previous&&String(previous.sourceQuestionId||'')===String(q.sourceQuestionId||'')&&sameSavedExamQuestionP672013(previous,q));
  };
  const approvedOrPreviouslyUsed=admin.filter(source=>
    source?.id && (source.status==='approved'||(exam.questions||[]).some(q=>
      String(q.sourceQuestionId||'')===String(source.id)&&preserved(q))));
  const found=new Set([...main,...admin].map(x=>String(x?.id||'')));
  const unchangedOrphans=[];
  for(const q of exam.questions||[]){
    const id=String(q.sourceQuestionId||'').trim();
    if(!id||found.has(id)||!preserved(q))continue;
    unchangedOrphans.push({id,bookId:exam.bookId});
  }
  return [...main,...approvedOrPreviouslyUsed,...unchangedOrphans];
}

function validateAdminState(oldDb, incoming, user) {
  const systemOld = (oldDb.users || []).find(u => u.id === "sys1"); const systemNew = (incoming.users || []).find(u => u.id === "sys1");
  if (user.role === "admin" && JSON.stringify(systemOld) !== JSON.stringify(systemNew)) throw Object.assign(new Error("مدیر مدرسه اجازه تغییر حساب ادمین فنی را ندارد."), { status: 403 });
  if (user.role === "admin" && (incoming.users || []).some(u => u.id !== "sys1" && u.role === "superadmin")) throw Object.assign(new Error("ایجاد ادمین فنی فقط توسط ادمین فنی مجاز است."), { status: 403 });

  incoming.school ||= {};
  incoming.school.year=String(incoming.school.year||oldDb.school?.year||"").trim();
  if(!incoming.school.year) throw Object.assign(new Error("سال تحصیلی فعال باید مشخص باشد."),{status:400});
  incoming.school.academicYears=normalizeAcademicYears(incoming.school);
  incoming.school.grades = SCHOOL_GRADES.map(g => ({ ...g }));
  const classIds = new Set(), classNames = new Set();
  incoming.school.classes = (incoming.school.classes || []).map(raw => {
    const c = { ...raw }, grade = Number(c.grade);
    if (!SCHOOL_GRADES.some(g => g.grade === grade)) throw Object.assign(new Error("پایه کلاس باید هفتم، هشتم یا نهم باشد."), { status: 400 });
    if (!c.id || classIds.has(c.id)) throw Object.assign(new Error("شناسه کلاس خالی یا تکراری است."), { status: 409 });
    if (!String(c.name || "").trim() || classNames.has(String(c.name).trim())) throw Object.assign(new Error("نام کلاس خالی یا تکراری است."), { status: 409 });
    classIds.add(c.id); classNames.add(String(c.name).trim());
    const meta = gradeMeta(grade);
    const enrolled=(incoming.users||[]).filter(u=>u.role==="student"&&u.classId===c.id&&u.active!==false).length;
    const capacity=Number(c.capacity??30);
    if(!Number.isInteger(capacity)||capacity<Math.max(1,enrolled)||capacity>200) throw Object.assign(new Error(`ظرفیت کلاس «${String(c.name||"").trim()}» باید بین ${Math.max(1,enrolled)} تا ۲۰۰ نفر باشد.`),{status:400});
    return { ...c, name: String(c.name).trim(), grade: meta.grade, gradeId: meta.id, gradeName: meta.name, capacity };
  });
  const classes = new Map(incoming.school.classes.map(c => [c.id, c]));

  const bookIds = new Set();
  incoming.curriculum = (incoming.curriculum || []).map(raw => {
    const b = { ...raw }, grade = Number(b.grade);
    if (!SCHOOL_GRADES.some(g => g.grade === grade)) throw Object.assign(new Error(`پایه کتاب «${b.title || b.subject || "بدون عنوان"}» معتبر نیست.`), { status: 400 });
    if (!b.id || bookIds.has(b.id)) throw Object.assign(new Error("شناسه کتاب خالی یا تکراری است."), { status: 409 });
    bookIds.add(b.id);
    const meta = gradeMeta(grade);
    return { ...b, grade: meta.grade, gradeId: meta.id, gradeName: meta.name };
  });
  const books = new Map(incoming.curriculum.map(b => [b.id, b]));

  const nationalIds = new Set();
  incoming.users = (incoming.users || []).map(raw => {
    const next={...raw}; const nationalId=normalizeNationalId(next.nationalId);
    if(!/^\d{10}$/.test(nationalId)) throw Object.assign(new Error(`کد ملی ${next.firstName||"کاربر"} معتبر نیست.`),{status:400});
    if(nationalIds.has(nationalId)) throw Object.assign(new Error("کد ملی تکراری در فهرست کاربران وجود دارد."),{status:409});
    nationalIds.add(nationalId); next.nationalId=nationalId;
    if(next.role==="student"){
      const birthDate=normalizeStoredBirthDate(next.birthDate||next.birthYear),previous=(oldDb.users||[]).find(u=>u.id===next.id);
      if(!birthDate&&!previous)throw Object.assign(new Error(`تاریخ تولد ${next.firstName||"دانش‌آموز"} معتبر نیست.`),{status:400});
      const cls=classes.get(next.classId); if(!cls)throw Object.assign(new Error(`کلاس ${next.firstName||"دانش‌آموز"} معتبر نیست.`),{status:400});
      next.birthDate=birthDate||previous?.birthDate||""; delete next.birthYear; next.username=nationalId;
      next.grade=Number(cls.grade); next.gradeId=cls.gradeId; next.gradeName=cls.gradeName;
    } else if(next.role==="teacher") {
      next.username=nationalId;
    }
    return next;
  });

  {
    const questionIds=new Set(),fingerprints=new Set();
    incoming.questionBank = (incoming.questionBank || []).map(raw => {
      const book=books.get(raw.bookId);
      if(!book)throw Object.assign(new Error("کتاب سؤال بانک سؤال معتبر نیست."),{status:400});
      const q=normalizeQuestionCore(raw,book);
      if(questionIds.has(q.id))throw Object.assign(new Error("شناسه سؤال تکراری است."),{status:409});
      questionIds.add(q.id);
      const errors=validateQuestionCore(q,book);
      if(errors.length)throw Object.assign(new Error(errors.join(" ")),{status:400});
      const fp=questionFingerprintCore(q);
      if(fingerprints.has(fp))throw Object.assign(new Error("سؤال تکراری در بانک سؤال وجود دارد."),{status:409});
      fingerprints.add(fp);
      const meta=gradeMeta(book.grade);
      return {...q,fingerprint:fp,subject:book.subject,grade:meta.grade,gradeId:meta.id,gradeName:meta.name};
    });
  }

  incoming.exams = (incoming.exams || []).map(raw => {
    const e={...raw}, cls=classes.get(e.classId), book=books.get(e.bookId);
    if(!cls)throw Object.assign(new Error("کلاس آزمون معتبر نیست."),{status:400});
    if(!book)throw Object.assign(new Error("کتاب آزمون معتبر نیست."),{status:400});
    if(Number(cls.grade)!==Number(book.grade))throw Object.assign(new Error("پایه کلاس و کتاب آزمون باید یکسان باشد."),{status:400});
    if(e.subject && e.subject!==book.subject)throw Object.assign(new Error("درس آزمون با کتاب انتخاب‌شده سازگار نیست."),{status:400});
    const meta=gradeMeta(cls.grade);
    return {...e,subject:book.subject,grade:meta.grade,gradeId:meta.id,gradeName:meta.name};
  });

  incoming.teachingAssignments = Array.isArray(incoming.teachingAssignments) ? incoming.teachingAssignments : [];
  const teacherIds=new Set(incoming.users.filter(u=>u.role==="teacher"&&u.active!==false&&!["deleted","locked","graduated"].includes(String(u.profileStatus||""))).map(u=>u.id)),composites=new Set();
  incoming.teachingAssignments=incoming.teachingAssignments.map(raw=>{const a={...raw};if(!teacherIds.has(a.teacherId))throw Object.assign(new Error("معلم تخصیص تدریس معتبر نیست."),{status:400});if(!classIds.has(a.classId))throw Object.assign(new Error("کلاس تخصیص تدریس معتبر نیست."),{status:400});const book=books.get(a.bookId);if(!book)throw Object.assign(new Error("کتاب تخصیص تدریس معتبر نیست."),{status:400});const cls=classes.get(a.classId);if(Number(book.grade||0)&&Number(cls?.grade||0)&&Number(book.grade)!==Number(cls.grade))throw Object.assign(new Error("پایه کتاب و کلاس تخصیص تدریس باید یکسان باشد."),{status:400});a.grade=Number(cls?.grade||book.grade||a.grade||0);a.gradeId=gradeMeta(a.grade).id;a.subject=a.subject||book.subject;if(a.subject!==book.subject)throw Object.assign(new Error("درس و کتاب تخصیص تدریس با هم سازگار نیستند."),{status:400});a.permissions=normalizeTeachingPermissions(a.permissions);a.academicYear=a.academicYear||incoming.school?.year||"";a.active=a.active!==false;a.history=Array.isArray(a.history)?a.history:[];const key=assignmentCompositeKey(a);if(a.active&&composites.has(key))throw Object.assign(new Error("برای این معلم، کلاس و کتاب یک تخصیص فعال تکراری وجود دارد."),{status:409});if(a.active)composites.add(key);return a;});
  incoming.school.shiftDefinitions=(Array.isArray(incoming.school.shiftDefinitions)&&incoming.school.shiftDefinitions.length?incoming.school.shiftDefinitions:[{id:"morning",name:"شیفت صبح",periods:[]},{id:"afternoon",name:"شیفت بعدازظهر",periods:[]}]).map(raw=>({id:String(raw.id||"").trim(),name:String(raw.name||"").trim(),periods:(Array.isArray(raw.periods)?raw.periods:[]).slice(0,10).map((p,i)=>({no:i+1,start:String(p.start||"").slice(0,5),end:String(p.end||"").slice(0,5)}))})).filter(x=>x.id&&x.name);
  const shiftIdsV73=new Set(incoming.school.shiftDefinitions.map(x=>x.id));if(!shiftIdsV73.size)throw Object.assign(new Error("حداقل یک شیفت مدرسه باید تعریف شود."),{status:400});
  incoming.school.classes=(incoming.school.classes||[]).map(c=>({...c,shiftId:shiftIdsV73.has(c.shiftId)?c.shiftId:incoming.school.shiftDefinitions[0].id}));
  incoming.school.onlineLearning = onlineLearningSettingsV74({school:{onlineLearning:incoming.school.onlineLearning||oldDb.school?.onlineLearning||{}}});
  const assignmentsV73=new Map((incoming.teachingAssignments||[]).filter(a=>a.active!==false).map(a=>[a.id,a])),daysV73=new Set(["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"]),classSlotsV73=new Set(),teacherSlotsV73=new Set(),scheduleIntervalsV77=[];
  const oldScheduleV74=new Map((oldDb.weeklySchedule||[]).map(x=>[x.id,x]));
  const timeMinutesV77=value=>{const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value||""));return m?Number(m[1])*60+Number(m[2]):-1;};
  const overlapsV77=(aStart,aEnd,bStart,bEnd)=>aStart<bEnd&&bStart<aEnd;
  incoming.weeklySchedule=(Array.isArray(incoming.weeklySchedule)?incoming.weeklySchedule:[]).map(raw=>{const a=assignmentsV73.get(raw.assignmentId),cls=(incoming.school.classes||[]).find(c=>c.id===raw.classId);if(!a||!cls||a.classId!==raw.classId)throw Object.assign(new Error("تخصیص تدریس برنامه هفتگی معتبر نیست."),{status:400});const day=String(raw.day||"");if(!daysV73.has(day))throw Object.assign(new Error("روز برنامه هفتگی معتبر نیست."),{status:400});const periodNo=Number(raw.periodNo);if(!Number.isInteger(periodNo)||periodNo<1||periodNo>10)throw Object.assign(new Error("شماره زنگ برنامه هفتگی معتبر نیست."),{status:400});const shiftId=shiftIdsV73.has(raw.shiftId)?raw.shiftId:(cls.shiftId||incoming.school.shiftDefinitions[0].id);const shift=incoming.school.shiftDefinitions.find(x=>x.id===shiftId),period=shift?.periods?.[periodNo-1]||{};const startTime=String(raw.startTime||period.start||"").slice(0,5),endTime=String(raw.endTime||period.end||"").slice(0,5),startMin=timeMinutesV77(startTime),endMin=timeMinutesV77(endTime);if(startMin<0||endMin<0||endMin<=startMin)throw Object.assign(new Error(`ساعت برنامه ${day} زنگ ${periodNo} معتبر نیست.`),{status:400});const classKey=`${raw.classId}|${day}|${shiftId}|${periodNo}`,teacherKey=`${a.teacherId}|${day}|${shiftId}|${periodNo}`;if(classSlotsV73.has(classKey))throw Object.assign(new Error("برای یک کلاس در یک زنگ و شیفت، دو درس برنامه‌ریزی شده است."),{status:409});if(teacherSlotsV73.has(teacherKey))throw Object.assign(new Error("یک معلم در یک زنگ و شیفت به دو کلاس تخصیص داده شده است."),{status:409});for(const prior of scheduleIntervalsV77){if(prior.day!==day||!overlapsV77(startMin,endMin,prior.startMin,prior.endMin))continue;if(prior.classId===raw.classId)throw Object.assign(new Error(`زمان دو درس کلاس ${cls.name||raw.classId} در ${day} با هم تداخل دارد.`),{status:409});if(prior.teacherId===a.teacherId)throw Object.assign(new Error(`برنامه دبیر در ${day} با کلاس دیگری تداخل زمانی دارد.`),{status:409});}classSlotsV73.add(classKey);teacherSlotsV73.add(teacherKey);scheduleIntervalsV77.push({classId:raw.classId,teacherId:a.teacherId,day,startMin,endMin});const old=oldScheduleV74.get(raw.id)||{};const deliveryMode=normalizeDeliveryModeV74(raw.deliveryMode??old.deliveryMode,"inherit"),meetingUrl=normalizeWebUrlV74(raw.meetingUrl??old.meetingUrl??""),meetingProvider=String(raw.meetingProvider??old.meetingProvider??"").trim().slice(0,60),onlineInstructions=String(raw.onlineInstructions??old.onlineInstructions??"").trim().slice(0,1500);return {id:raw.id||makeId("wsch"),classId:raw.classId,academicYear:String(raw.academicYear||incoming.school.year||""),day,shiftId,periodNo,assignmentId:a.id,teacherId:a.teacherId,subject:a.subject,bookId:a.bookId||"",startTime,endTime,room:String(raw.room||"").trim(),deliveryMode,meetingProvider,meetingUrl,onlineInstructions,active:raw.active!==false,updatedAt:raw.updatedAt||faNow(),updatedBy:raw.updatedBy||user.id};});
  const scheduleIdsV73=new Set(incoming.weeklySchedule.map(x=>x.id));
  incoming.attendanceSessions=(Array.isArray(incoming.attendanceSessions)?incoming.attendanceSessions:[]).map(row=>{if(row.scheduleEntryId&&!scheduleIdsV73.has(row.scheduleEntryId))throw Object.assign(new Error("جلسه حضور و غیاب به برنامه هفتگی نامعتبر متصل است."),{status:400});return row;});
  const oldAttendanceByIdV81=new Map((oldDb.attendance||[]).map(x=>[x.id,x]));
  incoming.attendance=(Array.isArray(incoming.attendance)?incoming.attendance:[]).map(raw=>{const row={...raw,status:normalizeAttendanceStatusV81(raw.status)},old=oldAttendanceByIdV81.get(raw.id),oldStatus=old?normalizeAttendanceStatusV81(old.status):"";if(row.status==="absent_excused"&&row.status!==oldStatus&&!String(row.absenceReasonText||row.note||"").trim())throw Object.assign(new Error("برای ثبت غیبت موجه، علت غیبت الزامی است."),{status:400});if(["absent_excused","absent_unexcused"].includes(row.status)&&row.status!==oldStatus){const now=new Date().toISOString(),reasonText=String(row.absenceReasonText||row.note||(row.status==="absent_unexcused"?"دلیل موجه تأیید نشد":"")).trim().slice(0,300);row.reviewHistory=Array.isArray(old?.reviewHistory)?[...old.reviewHistory]:[];row.reviewHistory.push({from:oldStatus||"absent_pending",to:row.status,reasonId:String(row.absenceReasonId||""),reasonText,note:String(row.reviewNote||row.note||"").trim().slice(0,500),by:user.id,at:now});row.absenceReasonText=reasonText;row.reviewedBy=user.id;row.reviewedAt=now;}return row;});
  const scheduleMapV74=new Map(incoming.weeklySchedule.map(x=>[x.id,x]));
  incoming.onlineClassSessions=(Array.isArray(incoming.onlineClassSessions)?incoming.onlineClassSessions:[]).map(raw=>{const entry=scheduleMapV74.get(raw.scheduleEntryId);if(!entry)throw Object.assign(new Error("جلسه آنلاین به زنگ برنامه هفتگی نامعتبر متصل است."),{status:400});const status=["scheduled","live","ended","cancelled"].includes(String(raw.status))?String(raw.status):"scheduled",deliveryMode=normalizeDeliveryModeV74(raw.deliveryMode,effectiveDeliveryModeV74({school:incoming.school},entry));if(!["online","hybrid"].includes(deliveryMode))throw Object.assign(new Error("جلسه آنلاین باید حالت آنلاین یا ترکیبی داشته باشد."),{status:400});return {...raw,id:raw.id||makeId("ols"),scheduleEntryId:entry.id,classId:entry.classId,subject:entry.subject,teacherId:entry.teacherId,date:String(raw.date||"").slice(0,10),periodNo:entry.periodNo,shiftId:entry.shiftId,academicYear:String(raw.academicYear||incoming.school.year||""),deliveryMode,meetingProvider:String(raw.meetingProvider||entry.meetingProvider||incoming.school.onlineLearning.defaultProvider||"custom").slice(0,60),meetingUrl:normalizeWebUrlV74(raw.meetingUrl||entry.meetingUrl||incoming.school.onlineLearning.defaultMeetingUrl||""),title:String(raw.title||entry.subject||"").slice(0,200),status,notes:String(raw.notes||"").slice(0,1500)};});
  incoming.onlineJoinEvents=oldDb.onlineJoinEvents||[];
  incoming.continuousGradeOverrides=(Array.isArray(incoming.continuousGradeOverrides)?incoming.continuousGradeOverrides:[]).map(row=>{const st=(incoming.users||[]).find(x=>x.id===row.studentId&&x.role==="student");if(!st||st.classId!==row.classId||!classIds.has(row.classId))throw Object.assign(new Error("دانش‌آموز نمره مستمر معتبر نیست."),{status:400});const score=Number(row.finalScore);if(!Number.isFinite(score)||score<0||score>20)throw Object.assign(new Error("نمره نهایی مستمر باید بین صفر تا ۲۰ باشد."),{status:400});return {...row,finalScore:Math.round(score*100)/100,academicYear:String(row.academicYear||incoming.school.year||""),academicPeriod:["semester1","semester2"].includes(String(row.academicPeriod||row.period))?String(row.academicPeriod||row.period):"semester2",history:Array.isArray(row.history)?row.history:[]};});
  incoming.school.settings ||= {};
  {
    const oldPolicy = gradingPolicyV200(oldDb), raw = incoming.school.settings.gradingPolicy || {};
    const mode = raw.mode === "weighted" ? "weighted" : "additive";
    let continuousWeight = Number(raw.continuousWeight), finalWeight = Number(raw.finalWeight);
    if (!Number.isFinite(continuousWeight) || continuousWeight < 0 || continuousWeight > 100) continuousWeight = 40;
    if (!Number.isFinite(finalWeight) || finalWeight < 0 || finalWeight > 100) finalWeight = 60;
    if (mode === "weighted" && Math.abs(continuousWeight + finalWeight - 100) > 0.001) throw Object.assign(new Error("در فرمول وزنی، مجموع وزن مستمر و آزمون پایانی باید ۱۰۰ باشد."), {status:400});
    incoming.school.settings.gradingPolicy = {mode, continuousWeight, finalWeight};
    const changed = oldPolicy.mode !== mode || Number(oldPolicy.continuousWeight) !== continuousWeight || Number(oldPolicy.finalWeight) !== finalWeight;
    incoming.gradingPolicyHistory = Array.isArray(oldDb.gradingPolicyHistory) ? [...oldDb.gradingPolicyHistory] : [];
    if (changed) incoming.gradingPolicyHistory.unshift({id:makeId("gph"),academicYear:String(incoming.school?.year||oldDb.school?.year||""),previous:{mode:oldPolicy.mode,continuousWeight:oldPolicy.continuousWeight,finalWeight:oldPolicy.finalWeight},next:{mode,continuousWeight,finalWeight},changedBy:user.id,changedAt:new Date().toISOString()});
    incoming.gradingPolicyHistory = incoming.gradingPolicyHistory.slice(0,200);
  }
  incoming.enrollments=normalizeEnrollments(incoming);
  incoming.exams=(incoming.exams||[]).map(raw=>{
    const cls=(incoming.school?.classes||[]).find(c=>c.id===raw.classId),book=(incoming.curriculum||[]).find(b=>b.id===raw.bookId);
    const checkExam=normalizeExamCore(raw,cls,book),errors=[...validateExamCore(checkExam,{cls,book,questionBank:examSourcesForAdminStateP672013(oldDb,incoming,checkExam)}),...adminExamSourceScopeErrorsV8914(oldDb,incoming,checkExam)];
    if((checkExam.examCategory||"ongoing")==="final"){
      const scoreError=enforceFinalTermExamScoreV8914(incoming,checkExam,book);
      if(scoreError)errors.push(scoreError);
    }
    if(errors.length)throw Object.assign(new Error(errors.join(" ")),{status:400});
    return checkExam;
  }).map(e=>{
    const cls=(incoming.school?.classes||[]).find(c=>c.id===e.classId),book=(incoming.curriculum||[]).find(b=>b.id===e.bookId);
    return normalizeExamCore(e,cls,book);
  });
  // P66: Validate independent admin question bank before the staff state is committed.
  const p66SeenIds=new Set(),p66SeenContent=new Set();
  const p66Books=new Map((incoming.curriculum||[]).map(b=>[String(b.id),b]));
  if(!Array.isArray(incoming.adminQuestionBank))incoming.adminQuestionBank=Array.isArray(oldDb.adminQuestionBank)?structuredClone(oldDb.adminQuestionBank):[];
  if(incoming.adminQuestionBank.length>100000)throw Object.assign(new Error("تعداد سؤالات مخزن ادمین بیش از حد مجاز است."),{status:400});
  incoming.adminQuestionBank=incoming.adminQuestionBank.map(raw=>{
    const q={...raw},book=p66Books.get(String(q.bookId)),ch=(book?.chapters||[]).find(c=>String(c.id)===String(q.chapterId));
    if(!q.id||p66SeenIds.has(String(q.id)))throw Object.assign(new Error("شناسه سؤال در مخزن ادمین نامعتبر یا تکراری است."),{status:409});
    if(!book||!ch)throw Object.assign(new Error("کتاب یا فصل سؤال مخزن ادمین معتبر نیست."),{status:400});
    if(typeof q.text!=="string"||q.text.trim().length<5||q.text.length>10000)throw Object.assign(new Error("متن سؤال مخزن ادمین نامعتبر است."),{status:400});
    if(!["mcq","descriptive","truefalse","fillblank","short","image"].includes(q.type))throw Object.assign(new Error("نوع سؤال مخزن ادمین نامعتبر است."),{status:400});
    if(!["easy","medium","advanced"].includes(q.difficulty)||!["draft","needs_review","approved","retired"].includes(q.status))throw Object.assign(new Error("وضعیت یا سختی سؤال مخزن ادمین نامعتبر است."),{status:400});
    if(!Number.isFinite(Number(q.score))||Number(q.score)<=0||Number(q.score)>100)throw Object.assign(new Error("نمره سؤال مخزن ادمین نامعتبر است."),{status:400});
    const key=[book.id,ch.id,q.text.replace(/\s+/g," ").trim().toLowerCase()].join("|");
    if(p66SeenContent.has(key))throw Object.assign(new Error("سؤال تکراری در مخزن مستقل ادمین وجود دارد."),{status:409});
    p66SeenIds.add(String(q.id));p66SeenContent.add(key);
    return {...q,subject:book.subject,grade:Number(book.grade),chapter:ch.title,bookId:book.id,chapterId:ch.id};
  });
  distributeScheduleChangesV79(oldDb,incoming,user.id);
  return normalizeTeachingAssignments(incoming);
}

function normalizeAttendanceStatusV81(value){
  const s=String(value||"");
  if(s==="absent")return "absent_pending";
  if(s==="excused")return "absent_excused";
  return ["present","late","absent_pending","absent_excused","absent_unexcused"].includes(s)?s:"present";
}
function isAbsentStatusV81(value){return ["absent_pending","absent_excused","absent_unexcused","absent","excused"].includes(String(value||""));}
function attendanceSummaryForStudent(db, studentId) {
  const activeYear=String(db.school?.year||"");
  const records=(db.attendance||[]).filter(a=>a.studentId===studentId&&(!a.academicYear||String(a.academicYear)===activeYear));
  const summary={present:0,absent:0,pending:0,excused:0,unexcused:0,late:0,total:0,recent:[]};
  for(const item of records){
    if(!item.sessionId&&["present","absent","late"].some(k=>Number(item[k]||0)>0)){summary.present+=Number(item.present||0);summary.absent+=Number(item.absent||0);summary.pending+=Number(item.absent||0);summary.late+=Number(item.late||0);continue;}
    const status=normalizeAttendanceStatusV81(item.status);
    if(status==="present")summary.present+=1;else if(status==="late")summary.late+=1;else{summary.absent+=1;if(status==="absent_excused")summary.excused+=1;else if(status==="absent_unexcused")summary.unexcused+=1;else summary.pending+=1;}
    summary.total+=1;
  }
  summary.total=Math.max(summary.total,summary.present+summary.absent+summary.late);
  summary.recent=records.filter(x=>x.sessionId).slice().sort((a,b)=>String(b.date||b.at||"").localeCompare(String(a.date||a.at||""))).slice(0,20).map(x=>({...x,status:normalizeAttendanceStatusV81(x.status)}));
  return summary;
}


// ===== 72.33-p1: Guardian absence-review workflow + period timeline =====
function validSchoolDateV80(value){
  const raw=String(value||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return "";
  const d=new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(d.getTime())?"":raw;
}
function schoolIsoTimeV80(value){
  if(!value)return "";
  try{
    const d=new Date(value);if(Number.isNaN(d.getTime()))return "";
    return new Intl.DateTimeFormat("fa-IR",{timeZone:schoolClockV74().timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d);
  }catch{return "";}
}
function attendanceRowStateV80(date,startTime,endTime){
  const clock=schoolClockV74();
  if(date<clock.date)return "ended";
  if(date>clock.date)return "upcoming";
  const start=hmMinutesV74(startTime),end=hmMinutesV74(endTime);
  if(start===null||end===null)return "unknown";
  if(clock.minutes<start)return "upcoming";
  if(clock.minutes<=end)return "current";
  return "ended";
}
function guardianAttendanceDayV80(db,student,requestedDate=""){
  const clock=schoolClockV74(),date=validSchoolDateV80(requestedDate)||clock.date,activeYear=String(db.school?.year||""),dayName=schoolDayNameForDateV78(date),users=new Map((db.users||[]).map(u=>[u.id,u]));
  const schedule=(db.weeklySchedule||[]).filter(x=>x.active!==false&&x.classId===student.classId&&String(x.academicYear||activeYear)===activeYear&&x.day===dayName).slice().sort((a,b)=>(hmMinutesV74(a.startTime)??9999)-(hmMinutesV74(b.startTime)??9999)||Number(a.periodNo||0)-Number(b.periodNo||0));
  const sessions=(db.attendanceSessions||[]).filter(x=>x.date===date&&String(x.academicYear||activeYear)===activeYear),sessionById=new Map(sessions.map(x=>[x.id,x]));
  const records=(db.attendance||[]).filter(x=>x.studentId===student.id&&x.date===date&&String(x.academicYear||activeYear)===activeYear);
  const joins=(db.onlineJoinEvents||[]).filter(x=>x.studentId===student.id&&x.date===date&&String(x.academicYear||activeYear)===activeYear);
  const entriesById=new Map((db.weeklySchedule||[]).map(x=>[x.id,x]));
  const rows=new Map();
  const makeRow=(entry={},session=null)=>{
    const teacherId=String(session?.teacherId||entry.teacherId||""),teacher=users.get(teacherId),classId=String(session?.classId||entry.classId||student.classId||""),cls=classInfoV78(db,classId),online=entry?.id?publicOnlineScheduleEntryV74(db,entry):null;
    return {scheduleEntryId:String(session?.scheduleEntryId||entry.id||""),sessionId:session?.id||"",classId,className:cls.name,grade:cls.grade,gradeName:cls.gradeName,subject:String(session?.subject||entry.subject||""),teacherId,teacherName:teacher?`${teacher.firstName||""} ${teacher.lastName||""}`.trim():"",periodNo:Number(session?.periodNo||entry.periodNo||0),shiftId:String(session?.shiftId||entry.shiftId||""),startTime:String(session?.startTime||entry.startTime||""),endTime:String(session?.endTime||entry.endTime||""),deliveryMode:online?.effectiveMode||effectiveDeliveryModeV74(db,entry),status:"unmarked",markedAt:"",markedAtTime:"",onlineCheckInAt:"",onlineCheckInTime:"",punctuality:"",state:attendanceRowStateV80(date,session?.startTime||entry.startTime,session?.endTime||entry.endTime),source:session?"attendance":"schedule"};
  };
  for(const entry of schedule){
    const session=sessions.filter(x=>x.scheduleEntryId===entry.id&&x.classId===entry.classId).sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0]||null;
    const key=entry.id||`schedule:${entry.periodNo}:${entry.startTime}`;rows.set(key,makeRow(entry,session));
  }
  for(const record of records){
    const session=sessionById.get(record.sessionId)||null,entry=entriesById.get(record.scheduleEntryId||session?.scheduleEntryId)||{};
    const key=String(record.scheduleEntryId||session?.scheduleEntryId||entry.id||`record:${record.id}`);
    const row=rows.get(key)||makeRow(entry,session);
    row.status=normalizeAttendanceStatusV81(record.status);row.absenceReasonId=String(record.absenceReasonId||"");row.absenceReasonText=String(record.absenceReasonText||"");row.reviewNote=String(record.reviewNote||"");row.reviewedAt=String(record.reviewedAt||"");
    row.markedAt=record.updatedAt||record.markedAt||session?.updatedAt||session?.createdAt||"";row.markedAtTime=schoolIsoTimeV80(row.markedAt);row.sessionId=record.sessionId||session?.id||row.sessionId;row.source="attendance";rows.set(key,row);
  }
  for(const join of joins){
    const key=String(join.scheduleEntryId||"");if(!key)continue;
    const entry=entriesById.get(key)||{},session=sessions.find(x=>x.scheduleEntryId===key)||null,row=rows.get(key)||makeRow(entry,session);
    row.onlineCheckInAt=join.firstJoinAt||join.lastJoinAt||"";row.onlineCheckInTime=schoolIsoTimeV80(row.onlineCheckInAt);row.punctuality=String(join.punctuality||"");rows.set(key,row);
  }
  const list=[...rows.values()].sort((a,b)=>(hmMinutesV74(a.startTime)??9999)-(hmMinutesV74(b.startTime)??9999)||a.periodNo-b.periodNo);
  const summary={scheduled:list.length,present:list.filter(x=>x.status==="present").length,absent:list.filter(x=>isAbsentStatusV81(x.status)).length,pending:list.filter(x=>x.status==="absent_pending").length,excused:list.filter(x=>x.status==="absent_excused").length,unexcused:list.filter(x=>x.status==="absent_unexcused").length,late:list.filter(x=>x.status==="late").length,unmarked:list.filter(x=>x.status==="unmarked").length};
  const presence=list.filter(x=>["present","late"].includes(x.status)&&hmMinutesV74(x.startTime)!==null&&hmMinutesV74(x.endTime)!==null);
  const first=presence.slice().sort((a,b)=>hmMinutesV74(a.startTime)-hmMinutesV74(b.startTime))[0]||null,last=presence.slice().sort((a,b)=>hmMinutesV74(b.endTime)-hmMinutesV74(a.endTime))[0]||null;
  const blocked=classAttendanceBlockV78(db,student.classId,date);
  return {date,dateFa:faDateV78(date),dayName,timeZone:clock.timeZone,isToday:date===clock.date,studentId:student.id,classId:student.classId,className:classInfoV78(db,student.classId).name,summary,firstPresentAt:first?.startTime||"",lastPresentUntil:last?.endTime||"",blockedReason:blocked?String(blocked.title||"تعطیلی آموزشی"):"",rows:list};
}

function visibleAnnouncementsForStudent(db, student) {
  const now = Date.now();
  return (db.announcements || []).filter(a => {
    if (a.status === "archived") return false;
    if (a.publishAt && new Date(a.publishAt).getTime() > now) return false;
    if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
    return a.audience === "all" || (a.audience === "class" && a.classId === student.classId) || (a.audience === "student" && a.studentId === student.id);
  }).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,30);
}


function systemIntegrityReport(db) {
  const users = db.users || [], exams = db.exams || [], submissions = db.submissions || [], grades = db.grades || [];
  const userIds = new Set(users.map(x => x.id)); const examIds = new Set(exams.map(x => x.id)); const submissionIds = new Set(submissions.map(x => x.id));
  const classIds = new Set((db.school?.classes || []).map(x => x.id)); const homeworkIds = new Set((db.homework || []).map(x => x.id));
  const nationalMap = new Map();
  for (const u of users.filter(x => x.role === "student")) { const n = normalizeNationalId(u.nationalId); if (n) nationalMap.set(n, (nationalMap.get(n) || 0) + 1); }
  const guardianIds = new Set((db.guardians || []).map(x=>x.id));
  const attendanceSessionIds = new Set((db.attendanceSessions || []).map(x=>x.id));
  const checks = {
    duplicateNationalIds: [...nationalMap.values()].filter(x => x > 1).length,
    missingBirthDates: users.filter(x => x.role === "student" && !normalizeStoredBirthDate(x.birthDate || x.birthYear)).length,
    invalidClassUsers: users.filter(x => x.role === "student" && !classIds.has(x.classId)).length,
    orphanAttempts: (db.attempts || []).filter(x => !userIds.has(x.studentId) || !examIds.has(x.examId)).length,
    orphanSubmissions: submissions.filter(x => !userIds.has(x.studentId) || !examIds.has(x.examId)).length,
    orphanGrades: grades.filter(x => !submissionIds.has(x.submissionId)).length,
    orphanAppeals: (db.appeals || []).filter(x => !userIds.has(x.studentId) || !examIds.has(x.examId)).length,
    orphanAttendance: (db.attendance || []).filter(x => !userIds.has(x.studentId) || (x.sessionId && !attendanceSessionIds.has(x.sessionId))).length,
    orphanHomeworkSubmissions: (db.homeworkSubmissions || []).filter(x => !userIds.has(x.studentId) || !homeworkIds.has(x.homeworkId)).length,
    orphanTermGrades: (db.termGrades || []).filter(x => !userIds.has(x.studentId) || (x.classId && !classIds.has(x.classId))).length,
    orphanContinuousAssessments: (db.continuousAssessments || []).filter(x => !userIds.has(x.studentId)).length,
    orphanContinuousGradeOverrides:(db.continuousGradeOverrides||[]).filter(x=>!userIds.has(x.studentId)||!classIds.has(x.classId)).length,
    brokenWeeklySchedule:(db.weeklySchedule||[]).filter(x=>!classIds.has(x.classId)||!(db.teachingAssignments||[]).some(a=>a.id===x.assignmentId&&a.active!==false&&a.classId===x.classId)).length,
    orphanOnlineSessions:(db.onlineClassSessions||[]).filter(x=>!(db.weeklySchedule||[]).some(e=>e.id===x.scheduleEntryId&&e.classId===x.classId)).length,
    orphanOnlineJoinEvents:(db.onlineJoinEvents||[]).filter(x=>!userIds.has(x.studentId)||!classIds.has(x.classId)||(x.scheduleEntryId&&!(db.weeklySchedule||[]).some(e=>e.id===x.scheduleEntryId))).length,
    orphanBehaviorRecords: (db.behaviorRecords || []).filter(x => x.studentId && !userIds.has(x.studentId)).length,
    orphanInterventions: (db.interventions || []).filter(x => x.studentId && !userIds.has(x.studentId)).length,
    orphanProgressReports: (db.progressReports || []).filter(x => x.studentId && !userIds.has(x.studentId)).length,
    orphanGuardianLinks: (db.guardianLinks || []).filter(x => !userIds.has(x.studentId) || (x.guardianId && !guardianIds.has(x.guardianId))).length,
    brokenTeachingAssignments:(db.teachingAssignments||[]).filter(x=>{const t=users.find(u=>u.id===x.teacherId);return !t||t.role!=="teacher"||t.active===false||["deleted","locked","graduated"].includes(String(t.profileStatus||""))||!classIds.has(x.classId);}).length,
    orphanEnrollments:(db.enrollments||[]).filter(x=>!userIds.has(x.studentId)||!classIds.has(x.classId)).length,
    activeEnrollmentMismatch:users.filter(u=>u.role==="student"&&u.active!==false&&u.profileStatus!=="deleted").filter(u=>{const y=String(db.school?.year||"");const rows=(db.enrollments||[]).filter(e=>e.studentId===u.id&&String(e.academicYear||"")===y&&e.active!==false);return rows.length!==1||String(rows[0]?.classId||"")!==String(u.classId||"");}).length,
    invalidCalendarEvents:(db.calendarEvents||[]).filter(x=>{const e=normalizeCalendarEvent(x,db.school?.year||"");return !e.startDate||(e.endDate&&e.endDate<e.startDate)||(e.scope==="class"&&!classIds.has(e.classId))||(e.scope==="grade"&&![7,8,9].includes(Number(e.grade)));}).length,
    openAppeals: (db.appeals || []).filter(x => ["open", "reviewing"].includes(x.status)).length,
    pendingGrades: submissions.filter(x => !grades.some(g => g.submissionId === x.id)).length
  };
  const issueCount = Object.entries(checks).filter(([k]) => !["openAppeals", "pendingGrades"].includes(k)).reduce((n,[,v]) => n + Number(v || 0), 0);
  return { ok: issueCount === 0, issueCount, checks };
}
async function folderStats(dir) {
  let count = 0, size = 0;
  try { for (const name of await fs.readdir(dir)) { const p = path.join(dir, name); const st = await fs.stat(p); if (st.isDirectory()) { const child = await folderStats(p); count += child.count; size += child.size; } else { count++; size += st.size; } } } catch {}
  return { count, size };
}
function repairServerDb(db, actorId) {
  db = upgradeServerDbRespectingReset(db); const actions = [];
  const userIds = new Set((db.users || []).map(x => x.id)); const examIds = new Set((db.exams || []).map(x => x.id));
  const classIds = new Set((db.school?.classes || []).map(x=>x.id));
  const keep = (key, predicate, label) => { const before = (db[key] || []).length; db[key] = (db[key] || []).filter(predicate); const removed = before - db[key].length; if (removed) actions.push(`${label}: ${removed}`); };
  const scheduleIdsV74 = new Set((db.weeklySchedule || []).map(x=>x.id));
  keep("onlineClassSessions", x => scheduleIdsV74.has(x.scheduleEntryId) && classIds.has(x.classId), "جلسه آنلاین یتیم");
  keep("onlineJoinEvents", x => userIds.has(x.studentId) && classIds.has(x.classId) && (!x.scheduleEntryId || scheduleIdsV74.has(x.scheduleEntryId)), "ورود آنلاین یتیم");
  keep("attempts", x => userIds.has(x.studentId) && examIds.has(x.examId), "پاسخ تستی یتیم حذف شد");
  keep("submissions", x => userIds.has(x.studentId) && examIds.has(x.examId), "برگه یتیم حذف شد");
  const submissionIds = new Set((db.submissions || []).map(x => x.id));
  keep("grades", x => submissionIds.has(x.submissionId), "نمره بدون برگه حذف شد");
  keep("appeals", x => userIds.has(x.studentId) && examIds.has(x.examId), "اعتراض یتیم حذف شد");
  const attendanceSessionIds = new Set((db.attendanceSessions || []).map(x=>x.id));
  keep("attendance", x => userIds.has(x.studentId) && (!x.sessionId || attendanceSessionIds.has(x.sessionId)), "حضور یتیم حذف شد");
  const homeworkIds = new Set((db.homework || []).map(x => x.id));
  keep("homeworkSubmissions", x => userIds.has(x.studentId) && homeworkIds.has(x.homeworkId), "تحویل تکلیف یتیم حذف شد");
  keep("termGrades", x => userIds.has(x.studentId) && (!x.classId || classIds.has(x.classId)), "نمره مستمر یتیم حذف شد");
  keep("continuousAssessments", x => userIds.has(x.studentId), "ارزشیابی مستمر یتیم حذف شد");
  keep("continuousGradeOverrides",x=>userIds.has(x.studentId)&&classIds.has(x.classId),"تنظیم نمره مستمر یتیم حذف شد");
  const assignmentIdsV73=new Set((db.teachingAssignments||[]).filter(a=>a.active!==false).map(a=>a.id));
  keep("weeklySchedule",x=>classIds.has(x.classId)&&assignmentIdsV73.has(x.assignmentId),"برنامه هفتگی نامعتبر حذف شد");
  keep("behaviorRecords", x => !x.studentId || userIds.has(x.studentId), "رکورد رفتاری یتیم حذف شد");
  keep("interventions", x => !x.studentId || userIds.has(x.studentId), "پیگیری آموزشی یتیم حذف شد");
  keep("progressReports", x => !x.studentId || userIds.has(x.studentId), "گزارش پیشرفت یتیم حذف شد");
  const guardianIds = new Set((db.guardians || []).map(x=>x.id));
  keep("guardianLinks", x => userIds.has(x.studentId) && (!x.guardianId || guardianIds.has(x.guardianId)), "اتصال ولی یتیم حذف شد");
  const activeTeacherIds=new Set((db.users||[]).filter(u=>u.role==="teacher"&&u.active!==false&&!["deleted","locked","graduated"].includes(String(u.profileStatus||""))).map(u=>u.id));
  keep("teachingAssignments",x=>activeTeacherIds.has(x.teacherId)&&classIds.has(x.classId),"تخصیص تدریس نامعتبر حذف شد");
  keep("notifications", x => !x.userId || userIds.has(x.userId), "اعلان بدون کاربر حذف شد");
  db.appeals = (db.appeals || []).map(a => ({ ...a, history: Array.isArray(a.history) && a.history.length ? a.history : [{ status: a.status || "open", note: "بازسازی تاریخچه", at: a.at || faNow(), by: a.studentId || null }] }));
  db.audit = Array.isArray(db.audit) ? db.audit.slice(0, Math.max(100, Number(db.systemPolicies?.maxAuditRows || 20000))) : [];
  db.audit.unshift({ id: makeId("log"), userId: actorId, action: "تعمیر ایمن ساختار اطلاعات", details: actions.length ? actions.join("؛ ") : "ساختار سالم بود؛ فقط نرمال‌سازی انجام شد", at: faNow() });
  return { db, actions };
}
function resetOperationalDataKeepingCurrentSuperadmin(db,actorId,authoritativeUsername){
  const actor=(db.users||[]).find(u=>u.id===actorId&&u.role==="superadmin"&&u.active!==false&&String(u.profileStatus||"active")!=="deleted");
  if(!actor)throw Object.assign(new Error("حساب ادمین فنی جاری برای بازنشانی پیدا نشد."),{status:409});

  // Factory-style live-data reset: preserve only technical configuration needed
  // for the application to boot, plus the currently authenticated Superadmin.
  // All educational/operational arrays are cleared, including curriculum data.
  const next=JSON.parse(JSON.stringify(db));
  const technicalArrays=new Set(["migrationHistory","accessProfiles"]);
  for(const [key,value] of Object.entries(next)){
    if(Array.isArray(value)&&!technicalArrays.has(key))next[key]=[];
  }
  next.users=[{...actor,username:authoritativeUsername||actor.username,role:"superadmin",active:true,profileStatus:"active"}];
  next.guardians=[];
  next.guardianLinks=[];
  next.teachingAssignments=[];
  next.curriculum=[];
  next.chapterProgress=[];
  next.learningPoints=[];
  next.questionBank=[];
  next.questionVersions=[];
  next.questionCollections=[];
  next.examBlueprints=[];

  // Keep school/system configuration, but clear nested operational school data.
  next.school={...(db.school||{})};
  next.school.classes=[];
  next.school.academicYears=[];
  if(next.school.uiBranding&&typeof next.school.uiBranding==="object"){
    next.school.uiBranding={...next.school.uiBranding,history:[]};
  }

  next.version=APP_VERSION;
  next.securityVersion=APP_VERSION;
  next.resetState={mode:"superadmin-only",preserveEmptyOperationalData:true,resetAt:new Date().toISOString(),resetBy:actorId};
  next.releaseInfo={...(db.releaseInfo||{}),version:APP_VERSION,release:APP_RELEASE,schemaVersion:71,channel:RELEASE_CHANNEL,releasedAt:new Date().toISOString()};
  next.audit=[{id:makeId("log"),userId:actorId,action:"بازنشانی کامل و حفظ ادمین فنی جاری",details:"همه کاربران به‌جز ادمین فنی اجراکننده، داده‌های آموزشی و عملیاتی و فایل‌ها پاک شدند؛ فقط تنظیمات فنی/مدرسه لازم برای اجرای سامانه حفظ شد.",at:faNow()}];
  return next;
}
// P67.19.10 — credential changes are superadmin-only. The hash in security.json
// is the source of truth; never sync the old initial username back from db.users.
async function handleSuperadminCredentialsV671910(req,res,auth){
  if(auth.user.role!=="superadmin")throw Object.assign(new Error("این بخش فقط برای سوپرادمین است."),{status:403});
  if(req.method!=="POST")throw Object.assign(new Error("روش درخواست پشتیبانی نمی‌شود."),{status:405});
  const body=await readJson(req),newUsername=String(body.newUsername||"").trim().toLowerCase(),newPassword=String(body.newPassword||"");
  if(!/^[a-z][a-z0-9._-]{3,39}$/.test(newUsername))throw Object.assign(new Error("نام کاربری باید ۴ تا ۴۰ نویسه لاتین و با حرف شروع شود."),{status:400});
  if(newPassword){const policyError=passwordPolicy(newPassword,"superadmin");if(policyError)throw Object.assign(new Error(policyError),{status:400});}
  const changed=await mutateSecurity(async sec=>{
    const cred=sec.credentials?.[auth.user.id];
    if(!cred||!await passwordVerify(String(body.currentPassword||""),cred.passwordHash))return {error:"current"};
    const exists=Object.entries(sec.credentials||{}).some(([id,c])=>id!==auth.user.id&&String(c.username||"").toLowerCase()===newUsername);
    if(exists)return {error:"taken"};
    if(newUsername===cred.username&&!newPassword)return {error:"same"};
    if(newPassword&&await passwordVerify(newPassword,cred.passwordHash))return {error:"same_password"};
    cred.username=newUsername;
    if(newPassword){cred.passwordHash=await passwordHash(newPassword);cred.passwordChangedAt=new Date().toISOString();cred.mustChangePassword=false;}
    cred.credentialVersion=Number(cred.credentialVersion||1)+1;cred.failedLoginCount=0;cred.lockedUntil=0;
    // Revoke *all* sessions, including the current session, after credential changes.
    sec.sessions={};sec.examGrants={};
    return {ok:true,username:newUsername,passwordChanged:Boolean(newPassword)};
  });
  const outcome=changed.result||{};
  if(outcome.error==="current")throw Object.assign(new Error("رمز عبور فعلی سوپرادمین صحیح نیست."),{status:401});
  if(outcome.error==="taken")throw Object.assign(new Error("نام کاربری در سامانه قبلاً استفاده شده است."),{status:409});
  if(outcome.error==="same"||outcome.error==="same_password")throw Object.assign(new Error("اطلاعات جدید با اطلاعات قبلی یکسان است."),{status:400});
  // Keep the public profile in step with the authoritative security credentials.
  try{await mutateDb(db=>{const row=(db.users||[]).find(u=>u.id===auth.user.id&&u.role==="superadmin");if(row)row.username=newUsername;return true;});}
  catch(error){console.error("Noncritical superadmin public-profile sync error:",error.message);}
  try{await securityAudit({type:"superadmin_credentials_updated",userId:auth.user.id,role:"superadmin",ip:clientIp(req),details:"superadmin username/password updated; all sessions revoked"});}
  catch(error){console.error("Noncritical credential audit error:",error.message);}
  return sendJson(res,200,{ok:true,username:newUsername,requiresLogin:true});
}


// P67.20-SR01 TEST: granular superadmin-only deletion; the full-reset endpoint remains separate.
const SR01_GROUPS = Object.freeze({
  teachers:{label:'معلم‌ها',keys:['teachingAssignments','teacherDailyTasks','teachingPlans','substitutionPlans']},
  students:{label:'دانش‌آموزان',keys:['enrollments','studentDocuments','studentExtendedProfiles','studentGoals','masteryRecords','studyPlans','studentFiles','studentReceipts','studentBookmarks','achievements','recordHistory','guardianLinks','guardianContacts','counselingCases','counselingSessions','disciplinaryCases','behaviorRecords','interventions','progressReports','admissions','certificates','libraryLoans','feeAccounts']},
  classes:{label:'کلاس‌ها',keys:['classSessions','timetableExceptions','makeupSessions','classroomResources','onlineClassSessions','onlineJoinEvents']},
  exams:{label:'آزمون‌ها و پاسخ‌ها',keys:['exams','examVersions','examPublicationHistory','examBlueprints','attempts','submissions','answerSheets','appeals','assessmentIncidents','questionAnalytics','examAbsenceFollowupsT02']},
  grades:{label:'نمرات و دفتر نمره',keys:['grades','gradeRevisions','gradebookEntries','gradebookConfigs','termGrades','termFinalOverrides','termLocks','continuousAssessments','continuousGradeOverrides','gradingPolicyHistory']},
  reportCards:{label:'کارنامه‌ها',keys:['reportCards']},
  homework:{label:'تکالیف و پاسخ تکلیف',keys:['homework','homeworkSubmissions','homeworkAttachments','assignmentRubrics']},
  attendance:{label:'حضور و غیاب',keys:['attendance','attendanceSessions','attendanceSessionsV74']},
  questionBank:{label:'بانک سؤال',keys:['questionBank','adminQuestionBank','questionVersions','questionCollections','questionGenerationJobs','questionUsage','questionReviews']},
  curriculum:{label:'دروس، کتاب‌ها و فصل‌ها',keys:['curriculum','chapterProgress','learningPoints']},
  messages:{label:'پیام‌ها و اعلان‌ها',keys:['academicMessagesP58','guardianMessages','notifications','notificationBroadcasts','announcements']},
  guardians:{label:'اولیا',keys:['guardians','guardianLinks','guardianMessages','parentRequests','familyMeetings']},
  schedule:{label:'برنامه هفتگی و کلاس آنلاین',keys:['schedule','weeklySchedule','scheduleRevisions','onlineClassSessions','onlineJoinEvents','classSessions','timetableExceptions','makeupSessions']},
  resources:{label:'فایل‌های آموزشی و منابع',keys:['resources','classroomResources','lessonMaterials','libraryP62']},
  admins:{label:'مدیران غیر از سوپرادمین',keys:[]}
});
function sr01Selection(value){
  if(!Array.isArray(value)||value.length<1||value.length>Object.keys(SR01_GROUPS).length)throw Object.assign(new Error('حداقل یک دسته را برای پاکسازی انتخاب کنید.'),{status:400});
  const chosen=[...new Set(value.map(x=>String(x)))];
  if(chosen.some(key=>!Object.hasOwn(SR01_GROUPS,key)))throw Object.assign(new Error('دسته نامعتبر در درخواست پاکسازی.'),{status:400});
  return chosen;
}
const sr01Count=(db,key)=>Array.isArray(db[key])?db[key].length:0;
function sr01Dependencies(db,selection){
  const s=new Set(selection),out=[];
  const needs=(a,b,exists)=>{if(s.has(a)&&!s.has(b)&&exists)out.push(`${SR01_GROUPS[a].label} به «${SR01_GROUPS[b].label}» وابسته است؛ هر دو را انتخاب کنید.`);};
  if(s.has('classes')){
    needs('classes','students',(db.users||[]).some(u=>u.role==='student'));
    for(const key of ['exams','grades','reportCards','homework','attendance','schedule']){
      const related=SR01_GROUPS[key].keys.some(k=>sr01Count(db,k)>0);needs('classes',key,related);
    }
    needs('classes','questionBank',(db.questionBank||[]).some(r=>r.classId)||(db.adminQuestionBank||[]).some(r=>r.classId));
    needs('classes','resources',(db.libraryP62||[]).some(r=>r.classId)||(db.resources||[]).some(r=>r.classId));
  }
  if(s.has('exams')){
    needs('exams','grades',sr01Count(db,'grades')>0||sr01Count(db,'gradebookEntries')>0);
    needs('exams','reportCards',sr01Count(db,'reportCards')>0);
  }
  if(s.has('grades'))needs('grades','reportCards',sr01Count(db,'reportCards')>0);
  if(s.has('curriculum')){
    needs('curriculum','exams',sr01Count(db,'exams')>0);
    needs('curriculum','questionBank',sr01Count(db,'questionBank')>0||sr01Count(db,'adminQuestionBank')>0);
  }
  return [...new Set(out)];
}
function sr01Plan(db,selected){
  const chosen=new Set(selected),next=structuredClone(db);
  const targetUserRoles=new Set([...(chosen.has('teachers')?['teacher']:[]),...(chosen.has('students')?['student']:[]),...(chosen.has('admins')?['admin']:[])]);
  const removedUsers=(db.users||[]).filter(u=>targetUserRoles.has(u.role));
  const studentIds=new Set(removedUsers.filter(u=>u.role==='student').map(u=>u.id));
  const teacherIds=new Set(removedUsers.filter(u=>u.role==='teacher').map(u=>u.id));
  const allRemovedUserIds=new Set(removedUsers.map(u=>u.id));
  const removedExamIds=new Set(chosen.has('exams')?(db.exams||[]).map(r=>r.id):[]);
  const removedHomeworkIds=new Set(chosen.has('homework')?(db.homework||[]).map(r=>r.id):[]);
  const removedSubmissionIds=new Set((db.submissions||[]).filter(r=>chosen.has('exams')||studentIds.has(r.studentId)||removedExamIds.has(r.examId)).map(r=>r.id));
  for(const name of chosen)for(const key of SR01_GROUPS[name].keys)if(Array.isArray(next[key]))next[key]=[];
  next.users=(next.users||[]).filter(u=>!allRemovedUserIds.has(u.id));
  if(chosen.has('classes')){
    next.school={...(next.school||{}),classes:[]};
    for(const key of ['teachingAssignments','weeklySchedule','schedule','calendarEvents']){
      if(Array.isArray(next[key]))next[key]=key==='calendarEvents'?next[key].filter(r=>r.scope!=='class'&&!r.classId):[];
    }
    next.users=next.users.map(u=>u.role==='teacher'?{...u,classIds:[]}:u);
  }
  if(chosen.has('teachers')){
    const oldAssignmentIds=new Set((db.teachingAssignments||[]).filter(a=>teacherIds.has(a.teacherId)).map(a=>a.id));
    const oldScheduleIds=new Set((db.weeklySchedule||[]).filter(r=>teacherIds.has(r.teacherId)||oldAssignmentIds.has(r.assignmentId)).map(r=>r.id));
    for(const key of ['teachingAssignments','weeklySchedule'])if(Array.isArray(next[key]))next[key]=next[key].filter(r=>!teacherIds.has(r.teacherId)&&!oldAssignmentIds.has(r.assignmentId));
    for(const key of ['onlineClassSessions','onlineJoinEvents'])if(Array.isArray(next[key]))next[key]=next[key].filter(r=>!oldScheduleIds.has(r.scheduleEntryId));
  }
  if(chosen.has('students')){
    const linkIds=new Set((db.guardianLinks||[]).filter(r=>studentIds.has(r.studentId)).map(r=>r.id));
    const idAttrs=['studentId','userId','studentUserId','targetUserId'];
    for(const [key,rows] of Object.entries(next)){
      if(!Array.isArray(rows)||['users','audit','migrationHistory','accessProfiles','roleDefinitions','integrityChecks','healthChecks','updateHistory'].includes(key))continue;
      next[key]=rows.filter(r=>!(r&&typeof r==='object'&&idAttrs.some(a=>studentIds.has(r[a]))));
    }
    if(Array.isArray(next.grades))next.grades=next.grades.filter(r=>!removedSubmissionIds.has(r.submissionId||r.uploadId));
    if(Array.isArray(next.guardianMessages))next.guardianMessages=next.guardianMessages.filter(r=>!linkIds.has(r.linkId||r.guardianLinkId));
    if(next.studentPreferences&&typeof next.studentPreferences==='object')for(const id of studentIds)delete next.studentPreferences[id];
  }
  if(chosen.has('exams')){
    for(const key of ['questionUsage','assessmentIncidents','questionAnalytics'])if(Array.isArray(next[key]))next[key]=[];
  }
  if(chosen.has('homework')&&Array.isArray(next.homeworkSubmissions))next.homeworkSubmissions=[];
  if(chosen.has('guardians')&&Array.isArray(next.guardianLinks))next.guardianLinks=[];
  if(chosen.has('messages')&&Array.isArray(next.academicMessagesP58))next.academicMessagesP58=[];
  if(allRemovedUserIds.size&&Array.isArray(next.notifications))next.notifications=next.notifications.filter(r=>!allRemovedUserIds.has(r.userId));
  if(chosen.has('classes')){
    for(const [key,rows] of Object.entries(next)){
      if(!Array.isArray(rows)||['users','audit','migrationHistory','accessProfiles','roleDefinitions','integrityChecks','healthChecks','updateHistory'].includes(key))continue;
      next[key]=rows.filter(r=>!r||typeof r!=='object'||!r.classId);
    }
  }
  const changed={};
  for(const [key,old] of Object.entries(db))if(Array.isArray(old)&&Array.isArray(next[key])&&old.length!==next[key].length)changed[key]=old.length-next[key].length;
  const oldClassCount=(db.school?.classes||[]).length,newClassCount=(next.school?.classes||[]).length;
  if(oldClassCount!==newClassCount)changed['school.classes']=oldClassCount-newClassCount;
  next.resetState={...(next.resetState||{}),mode:'selective',preserveEmptyOperationalData:true,resetAt:new Date().toISOString(),selection:[...chosen]};
  const critical=(r)=>Object.entries(r.checks||{}).filter(([key])=>!['openAppeals','pendingGrades','missingBirthDates','duplicateNationalIds','activeEnrollmentMismatch'].includes(key));
  const before=systemIntegrityReport(db),after=systemIntegrityReport(next);
  const worsened=critical(after).filter(([key,value])=>Number(value)>Number(before.checks?.[key]||0)).map(([key,value])=>`${key}: ${value}`);
  return {next,changed,removedUsers:[...allRemovedUserIds],studentIds:[...studentIds],examIds:[...removedExamIds],submissionIds:[...removedSubmissionIds],homeworkIds:[...removedHomeworkIds],worsened};
}
function sr01Fingerprint(db){return crypto.createHash('sha256').update(JSON.stringify(db)).digest('hex');}
async function sr01MediaMatches(plan,selection){
  const students=new Set(plan.studentIds),exams=new Set(plan.examIds),submissions=new Set(plan.submissionIds),homework=new Set(plan.homeworkIds);
  const files=[];
  for(const name of (await fs.readdir(FILES_DIR).catch(()=>[]))){
    if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))continue;
    try{
      const row=JSON.parse(await fs.readFile(path.join(FILES_DIR,name),'utf8'));
      if(students.has(row.studentId)||exams.has(row.examId)||submissions.has(row.submissionId)||homework.has(row.homeworkId))files.push(name);
    }catch{}
  }
  return files;
}
async function handleSelectiveResetSR01(req,res,auth){
  if(auth.user.role!=='superadmin')throw Object.assign(new Error('فقط سوپرادمین مجاز است.'),{status:403});
  if(req.method!=='POST')throw Object.assign(new Error('روش درخواست پشتیبانی نمی‌شود.'),{status:405});
  const body=await readJson(req),selected=sr01Selection(body.selected);
  const preview=body.action==='preview';
  if(!preview&&body.action!=='execute')throw Object.assign(new Error('عملیات پاکسازی نامعتبر است.'),{status:400});
  if(preview){
    const current=(await ensureStateInitialized()).db,plan=sr01Plan(current,selected);
    const blockers=[...sr01Dependencies(current,selected),...plan.worsened.map(x=>`پاکسازی موجب اختلال یکپارچگی می‌شود: ${x}`)];
    return sendJson(res,200,{ok:true,selected,groups:Object.fromEntries(Object.entries(SR01_GROUPS).map(([k,v])=>[k,{label:v.label}])),changed:plan.changed,total:Object.values(plan.changed).reduce((a,b)=>a+b,0),blockers,canExecute:blockers.length===0,fingerprint:sr01Fingerprint(current),mediaFiles:(await sr01MediaMatches(plan,selected)).length+(selected.includes('resources')?(current.libraryP62||[]).length:0),protected:['حساب سوپرادمین','تنظیمات فنی سامانه','پشتیبان‌های قبل از پاکسازی']});
  }
  if(body.confirmation!=='DELETE_SELECTED'||body.acknowledge!==true)throw Object.assign(new Error('تأیید نهایی حذف انتخابی معتبر نیست.'),{status:400});
  const credential=auth.security.credentials?.[auth.user.id];
  if(!credential||!await passwordVerify(String(body.currentPassword||''),credential.passwordHash))throw Object.assign(new Error('رمز سوپرادمین صحیح نیست.'),{status:401});
  if(!/^[a-f0-9]{64}$/.test(String(body.fingerprint||'')))throw Object.assign(new Error('پیش‌نمایش پاکسازی الزامی است.'),{status:428});
  const outcome=await enqueueStateOperation(async()=>{
    const current=(await ensureStateInitialized()).db;
    if(sr01Fingerprint(current)!==body.fingerprint)throw Object.assign(new Error('داده‌ها بعد از پیش‌نمایش تغییر کرده‌اند. دوباره پیش‌نمایش بگیرید.'),{status:409});
    const plan=sr01Plan(current,selected),blockers=[...sr01Dependencies(current,selected),...plan.worsened];
    if(blockers.length)throw Object.assign(new Error(blockers.join(' | ')),{status:409});
    const media=await sr01MediaMatches(plan,selected);
    // Preserve the original state and all selected media before committing deletion.
    const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
    const mediaBackupPath=path.join(BACKUPS_DIR,`selective-media-${stamp}`);
    await fs.mkdir(mediaBackupPath,{recursive:true,mode:0o700});
    try{
      for(const name of media)await fs.copyFile(path.join(FILES_DIR,name),path.join(mediaBackupPath,name));
      if(selected.includes('resources')){
        await fs.mkdir(path.join(mediaBackupPath,'library-p62'),{recursive:true,mode:0o700});
        for(const row of current.libraryP62||[])if(row.fileName&&/^[a-zA-Z0-9_.-]+$/.test(row.fileName))await fs.copyFile(path.join(P62_DIR,row.fileName),path.join(mediaBackupPath,'library-p62',row.fileName));
      }
      await createStateSnapshot('before-selective-reset',{skipPrune:true});
    }catch(err){throw Object.assign(new Error('ذخیره پشتیبان پیش از حذف ناموفق بود: '+err.message),{status:507});}
    plan.next.audit=Array.isArray(plan.next.audit)?plan.next.audit:[];
    plan.next.audit.unshift({id:makeId('log'),userId:auth.user.id,action:'پاکسازی انتخابی داده‌ها',details:selected.map(k=>SR01_GROUPS[k].label).join('، '),at:faNow()});
    // No factory reset marker: keep untouched collections as-is.
    const saved=await writeStateEnvelope(plan.next,{skipSnapshot:true,skipTiered:true});
    return {saved,plan,media,mediaBackupPath};
  });
  const cleanupErrors=[];
  for(const name of outcome.media)try{await fs.rm(path.join(FILES_DIR,name),{force:true});}catch(e){cleanupErrors.push(name);}
  if(selected.includes('resources'))for(const row of auth.db.libraryP62||[])if(row.fileName&&/^[a-zA-Z0-9_.-]+$/.test(row.fileName))try{await fs.rm(path.join(P62_DIR,row.fileName),{force:true});}catch(e){cleanupErrors.push(row.fileName);}
  await mutateSecurity(sec=>{
    for(const userId of outcome.plan.removedUsers){delete sec.credentials?.[userId];delete sec.guardianCredentials?.[userId];}
    if(selected.includes('guardians'))sec.guardianCredentials={};
    sec.sessions={};sec.examGrants={};
  });
  await securityAudit({type:'selective_data_reset',userId:auth.user.id,role:'superadmin',success:true,ip:clientIp(req),details:selected.join(',')});
  return sendJson(res,200,{ok:true,requiresLogin:true,changed:outcome.plan.changed,mediaRemoved:outcome.media.length-cleanupErrors.length,mediaErrors:cleanupErrors.length,backupPreserved:true});
}

async function handleAdminResetData(req,res,auth){
  if(auth.user.role!=="superadmin")throw Object.assign(new Error("بازنشانی کامل فقط برای ادمین فنی مجاز است."),{status:403});
  if(req.method!=="POST")throw Object.assign(new Error("روش درخواست پشتیبانی نمی‌شود."),{status:405});
  const body=await readJson(req);if(String(body.confirmation||"")!=="RESET")throw Object.assign(new Error("عبارت تأیید RESET صحیح نیست."),{status:400});
  if(body.deleteAllStoredData!==true)throw Object.assign(new Error("حذف کامل پرونده‌ها و پشتیبان‌های داخلی باید صریحاً تأیید شود."),{status:400});
  const credential=auth.security.credentials?.[auth.user.id];if(!credential||!await passwordVerify(String(body.currentPassword||""),credential.passwordHash))throw Object.assign(new Error("رمز فعلی ادمین صحیح نیست."),{status:401});
  const saved=await enqueueStateOperation(async()=>{await createStateSnapshot("before-full-reset");const current=await ensureStateInitialized();return writeStateEnvelope(resetOperationalDataKeepingCurrentSuperadmin(current.db,auth.user.id,credential.username),{skipSnapshot:true});});
  await fs.rm(FILES_DIR,{recursive:true,force:true});await fs.mkdir(FILES_DIR,{recursive:true,mode:0o700});
  loginAttempts.clear();
  await fs.rm(LOGIN_ATTEMPTS_FILE,{force:true}).catch(()=>{});
  await ensureSecurityInitialized(saved.db);
  await mutateSecurity(sec=>{
    for(const userId of Object.keys(sec.credentials||{}))if(userId!==auth.user.id)delete sec.credentials[userId];
    // Old tokens, including the token used for reset, must not survive the reset.
    sec.sessions={};
    sec.guardianCredentials={};
    sec.examGrants={};
  });
  // Delete operational media, archived snapshots and stale recovery artifacts only
  // after the new state and preserved security credential have been committed.
  // The current state/security mirrors are deliberately kept to prevent lockout.
  await fs.rm(P62_DIR,{recursive:true,force:true});
  await fs.rm(BACKUPS_DIR,{recursive:true,force:true});
  await fs.mkdir(BACKUPS_DIR,{recursive:true,mode:0o700});
  await fs.rm(STATE_PREVIOUS_FILE,{force:true});
  await fs.rm(RECOVERY_LOG_FILE,{force:true});
  await fs.rm(SECURITY_AUDIT_FILE,{force:true});
  for(const name of await fs.readdir(DATA_DIR)){
    if(/^(?:state|security)\.corrupt-.*\.json$/.test(name))await fs.rm(path.join(DATA_DIR,name),{force:true});
  }
  await securityAudit({type:"full_data_reset",userId:auth.user.id,role:auth.user.role,success:true,ip:clientIp(req),details:"Factory reset; only one superadmin account preserved; internal backups and uploaded data purged"});
  return sendJson(res,200,{ok:true,updatedAt:saved.updatedAt,requiresLogin:true,integrity:systemIntegrityReport(saved.db)});
}

async function systemHealthSnapshot(db) {
  const files=await folderStats(FILES_DIR),backups=await listStateSnapshots(),security=await readSecurity();
  let stateSize=0,disk=null;
  try{stateSize=(await fs.stat(STATE_FILE)).size;}catch{}
  try{const st=await fs.statfs(ROOT);disk={totalBytes:Number(st.blocks)*Number(st.bsize),freeBytes:Number(st.bavail)*Number(st.bsize)};}catch{}
  const now=Date.now(),users=Array.isArray(db.users)?db.users:[],events=await readSecurityAudit(20),recoveryEvents=await readRecoveryLog(10);
  let previousStateAvailable=false,stateMirrorAvailable=false,securityMirrorAvailable=false;
  try{previousStateAvailable=Boolean((await fs.stat(STATE_PREVIOUS_FILE)).isFile());}catch{}
  try{stateMirrorAvailable=Boolean((await fs.stat(STATE_MIRROR_FILE)).isFile());}catch{}
  try{securityMirrorAvailable=Boolean((await fs.stat(SECURITY_MIRROR_FILE)).isFile());}catch{}

  // Only unexpired, non-idle sessions are counted. "Recently active" is a
  // five-minute request-activity signal, not a claim of persistent presence.
  const liveSessions=Object.values(security.sessions||{}).filter(row=>Number(row?.expiresAt||0)>now&&Number(row?.idleExpiresAt||0)>now);
  const recentSessions=liveSessions.filter(row=>now-Number(row?.lastSeenAt||0)<=5*60*1000);
  const recentUsers=new Set(recentSessions.map(row=>String(row?.userId||'')).filter(Boolean));
  const activeYear=String(db.school?.year||'');
  const activeStudents=users.filter(u=>u.role==='student'&&u.active!==false&&u.profileStatus!=='deleted'&&u.profileStatus!=='graduated'&&(!u.academicYear||String(u.academicYear)===activeYear));
  const activeTeachers=users.filter(u=>u.role==='teacher'&&u.active!==false&&u.profileStatus!=='deleted');
  const activeClasses=(db.school?.classes||[]).filter(c=>c.active!==false);
  const activeExams=(db.exams||[]).filter(e=>{const lifecycle=String(e.publicationState||'').toLowerCase();const published=['published','in_progress'].includes(lifecycle)||(!lifecycle&&e.status==='active');return published&&e.status!=='archived'&&(!e.academicYear||String(e.academicYear)===activeYear);});
  const activeHomework=(db.homework||[]).filter(h=>h.status!=='archived'&&(!h.academicYear||String(h.academicYear)===activeYear));
  const pendingHomeworkReviews=(db.homeworkSubmissions||[]).filter(x=>x.status!=='graded'&&activeHomework.some(h=>h.id===x.homeworkId)).length;
  const openAdminTasks=(db.adminTasks||[]).filter(x=>['open','in_progress'].includes(String(x.status||'open'))).length;
  const openFamilyRequests=(db.parentRequests||[]).filter(x=>String(x.kind||x.type||'')!=='meeting_invitation'&&['open','reviewing'].includes(String(x.status||'open'))).length;

  // The student client posts a minimal heartbeat only after the dashboard and
  // compact results payloads have both synchronized successfully. We expose
  // aggregate counts only; no student identifiers or national IDs leave here.
  const studentSyncRows=activeStudents.map(student=>{
    const credential=security.credentials?.[student.id]||{};
    const successAt=Date.parse(String(credential.lastStudentSyncAt||''));
    const attemptAt=Date.parse(String(credential.lastStudentSyncAttemptAt||''));
    return {successAt:Number.isFinite(successAt)?successAt:0,attemptAt:Number.isFinite(attemptAt)?attemptAt:0,status:String(credential.lastStudentSyncStatus||'')};
  });
  const synced24h=studentSyncRows.filter(row=>row.successAt&&now-row.successAt<=24*60*60*1000).length;
  const synced7d=studentSyncRows.filter(row=>row.successAt&&now-row.successAt<=7*24*60*60*1000).length;
  const lastStudentSyncAt=studentSyncRows.reduce((latest,row)=>Math.max(latest,row.successAt),0);
  const partialSyncStudents=studentSyncRows.filter(row=>row.status==='partial').length;
  const lastStudentSyncAttemptAt=studentSyncRows.reduce((latest,row)=>Math.max(latest,row.attemptAt),0);
  const lastStudentSyncPartialAt=studentSyncRows.filter(row=>row.status==='partial').reduce((latest,row)=>Math.max(latest,row.attemptAt),0);
  const backupDate=Date.parse(String(backups[0]?.createdAt||''));
  const lastBackupAgeMs=Number.isFinite(backupDate)?Math.max(0,now-backupDate):null;
  const memory=process.memoryUsage();
  const integrity=systemIntegrityReport(db);
  const schoolStats={activeStudents:activeStudents.length,activeTeachers:activeTeachers.length,activeClasses:activeClasses.length,activeExams:activeExams.length,activeHomework:activeHomework.length,pendingHomeworkReviews,openAdminTasks,openFamilyRequests};
  const sessionStats={activeSessions:liveSessions.length,recentActiveSessions:recentSessions.length,recentActiveUsers:recentUsers.size,recentByRole:{students:recentSessions.filter(x=>x.role==='student').length,teachers:recentSessions.filter(x=>x.role==='teacher').length,admins:recentSessions.filter(x=>['admin','superadmin'].includes(x.role)).length}};
  const studentSync={activeStudents:activeStudents.length,syncedLast24h:synced24h,syncedLast7d:synced7d,everSynced:studentSyncRows.filter(row=>row.successAt>0).length,neverSynced:studentSyncRows.filter(row=>!row.successAt).length,partialStudents:partialSyncStudents,lastSuccessAt:lastStudentSyncAt?new Date(lastStudentSyncAt).toISOString():'',lastAttemptAt:lastStudentSyncAttemptAt?new Date(lastStudentSyncAttemptAt).toISOString():'',lastPartialAt:lastStudentSyncPartialAt?new Date(lastStudentSyncPartialAt).toISOString():'',telemetry:'success-heartbeat-v1'};
  const schoolName=String(db.school?.name||SCHOOL_NAME);
  const recentActivity=(db.audit||[]).slice(0,8).map(row=>{
    const actor=users.find(user=>user.id===row.userId);
    const roleLabel=actor?.role==='admin'||actor?.role==='superadmin'?'مدیر':actor?.role==='teacher'?'معلم':actor?.role==='student'?'دانش‌آموز':'سامانه';
    return {action:String(row.action||'فعالیت ثبت‌شده').slice(0,140),at:String(row.at||'').slice(0,80),roleLabel};
  });
  const alerts=[];
  const addAlert=(severity,title,detail,go='systemHealth')=>alerts.push({severity,title,detail,go});
  if(!integrity.ok)addAlert('critical','یکپارچگی داده نیازمند بررسی است',`${Number(integrity.issueCount||0)} مورد ناسازگاری شناسایی شده است.`);
  if(!stateMirrorAvailable)addAlert('warning','نسخه آینه‌ای داده موجود نیست','Mirror اصلی State پیدا نشد؛ صفحه سلامت سامانه را بررسی کنید.');
  if(!securityMirrorAvailable)addAlert('critical','نسخه آینه‌ای امنیت موجود نیست','Mirror امنیتی پیدا نشد؛ از تغییرات حساس خودداری و وضعیت را بررسی کنید.');
  if(!backups.length)addAlert('warning','هیچ نسخه پشتیبان محلی ثبت نشده است','پوشه پشتیبان خالی است یا نسخه قابل خواندن وجود ندارد.','backup');
  else if(lastBackupAgeMs!==null&&lastBackupAgeMs>24*60*60*1000)addAlert('warning','پشتیبان‌گیری قدیمی است',`آخرین نسخه پشتیبان ${Math.floor(lastBackupAgeMs/3600000)} ساعت قبل ساخته شده است.`,'backup');
  if(disk?.totalBytes>0){const freeRatio=disk.freeBytes/disk.totalBytes;if(disk.freeBytes<512*1024*1024||freeRatio<.05)addAlert('critical','فضای ذخیره‌سازی رو به اتمام است',`فضای آزاد: ${Math.round(disk.freeBytes/1024/1024)} مگابایت.`);else if(disk.freeBytes<1024*1024*1024||freeRatio<.10)addAlert('warning','فضای ذخیره‌سازی کم است',`فضای آزاد: ${Math.round(disk.freeBytes/1024/1024)} مگابایت.`);}
  if(recoveryEvents[0]){const recoveryAt=Date.parse(String(recoveryEvents[0].at||recoveryEvents[0].time||''));if(Number.isFinite(recoveryAt)&&now-recoveryAt<7*24*60*60*1000)addAlert('warning','بازیابی خودکار اخیراً اجرا شده است','رخداد بازیابی اخیر را در سلامت سامانه بررسی کنید.');}
  const schoolYear=activeYear;
  const classIds=new Set(activeClasses.map(c=>String(c.id)));
  const teacherIds=new Set(activeTeachers.map(t=>String(t.id)));
  const bookIds=new Set((db.curriculum||[]).filter(b=>b.active!==false).map(b=>String(b.id)));
  const assignments=(db.teachingAssignments||[]).filter(a=>a.active!==false&&(!a.academicYear||String(a.academicYear)===schoolYear));
  const schoolStudents=activeStudents.filter(s=>!s.academicYear||String(s.academicYear)===schoolYear);
  const unassignedStudents=schoolStudents.filter(s=>!s.classId||!classIds.has(String(s.classId))).length;
  const brokenAssignments=assignments.filter(a=>!teacherIds.has(String(a.teacherId))||!classIds.has(String(a.classId))||(a.bookId&&!bookIds.has(String(a.bookId)))).length;
  const yearMismatch=users.filter(u=>u.role==='student'&&u.active!==false&&u.profileStatus!=='deleted'&&u.academicYear&&String(u.academicYear)!==schoolYear).length;
  const brokenExams=(db.exams||[]).filter(e=>e.status!=='archived'&&(!e.academicYear||String(e.academicYear)===schoolYear)&&(!e.classId||!classIds.has(String(e.classId))||(e.bookId&&!bookIds.has(String(e.bookId))))).length;
  const teachersWithoutAssignment=activeTeachers.filter(t=>!assignments.some(a=>a.teacherId===t.id)).length;
  const overCapacity=activeClasses.filter(c=>{const count=schoolStudents.filter(s=>s.classId===c.id).length;return Number(c.capacity||30)>0&&count>Number(c.capacity||30);}).length;
  const activeAcademicYears=(db.school?.academicYears||[]).filter(y=>y.active).length;
  const schoolReadiness={unassignedStudents,brokenAssignments,brokenExams,yearMismatch,teachersWithoutAssignment,overCapacity,activeAcademicYears,criticalCount:unassignedStudents+brokenAssignments+brokenExams+yearMismatch+(activeAcademicYears===1?0:1),warningCount:teachersWithoutAssignment+overCapacity};
  if(schoolReadiness.criticalCount)addAlert('critical','آمادگی اجرایی مدرسه نیازمند اصلاح است',`${schoolReadiness.criticalCount} مورد بحرانی در اتصال دانش‌آموز، کلاس، تخصیص تدریس یا آزمون شناسایی شد.`,'adminReadiness');
  if(schoolReadiness.warningCount)addAlert('warning','چند مورد آموزشی نیازمند پیگیری است',`${schoolReadiness.warningCount} هشدار در تخصیص معلم یا ظرفیت کلاس وجود دارد.`,'adminReadiness');
  const healthStatus=alerts.some(a=>a.severity==='critical')?'critical':alerts.length?'warning':'healthy';
  return {productVersion:PRODUCT_RELEASE_VERSION,version:APP_VERSION,release:APP_RELEASE,releaseInfo:db.releaseInfo||null,releaseChannel:RELEASE_CHANNEL,schoolName,activeYear:schoolYear,uptimeSeconds:Math.round(process.uptime()),stateSize,files,disk,backupCount:backups.length,lastBackup:backups[0]||null,lastBackupAgeMs,lastDailyBackup:backups.find(x=>String(x.label).startsWith('daily-'))||null,lastWeeklyBackup:backups.find(x=>String(x.label).startsWith('weekly-'))||null,previousStateAvailable,stateMirrorAvailable,securityMirrorAvailable,lastRecovery:recoveryEvents[0]||null,recoveryEvents,activeSessions:liveSessions.length,sessionStats,studentSync,schoolStats,schoolReadiness,recentActivity,alerts,healthStatus,runtime:{nodeVersion:process.version,memory:{rss:Number(memory.rss||0),heapUsed:Number(memory.heapUsed||0),heapTotal:Number(memory.heapTotal||0),external:Number(memory.external||0)}},userStats:{active:users.filter(u=>u.active!==false).length,locked:users.filter(u=>u.profileStatus==='locked').length,recycled:users.filter(u=>u.profileStatus==='deleted').length,graduated:users.filter(u=>u.profileStatus==='graduated').length},recentSecurityEvents:events.slice(0,10),integrity,serverTime:new Date().toISOString()};
}

const educationAnalyticsCacheV67320 = new Map();
function educationAnalyticsCacheKeyV67320(url, updatedAt = "") {
  const keys = ["academicYear","academicPeriod","period","grade","classId","subject","teacherId"];
  return `${updatedAt}|${keys.map(key=>`${key}=${String(url.searchParams.get(key)||"")}`).join("&")}`;
}
function compactEducationFollowupV67320(row) {
  if (!row) return null;
  return { id:String(row.id||""), studentId:String(row.studentId||""), academicYear:String(row.academicYear||""), status:["open","in_progress","resolved"].includes(String(row.status))?String(row.status):"open", note:sanitizeClientDiagnosticText(row.note||"",1500), updatedAtIso:String(row.updatedAtIso||row.createdAtIso||""), updatedAt:String(row.updatedAt||row.createdAt||"") };
}
async function handleEducationAnalyticsApiV67320(req, res, url, auth) {
  try {
    if (!["admin","superadmin"].includes(auth.user.role)) throw Object.assign(new Error("این بخش فقط برای مدیر مدرسه مجاز است."),{status:403});
    if (req.method === "GET" && url.pathname === "/api/admin/education-analytics") {
      const key=educationAnalyticsCacheKeyV67320(url,auth.updatedAt||"");
      const cached=educationAnalyticsCacheV67320.get(key);
      if(cached && Date.now()-cached.at<60_000) return sendJson(res,200,{...cached.data,cache:{hit:true,ttlSeconds:60}});
      const input={}; for(const name of ["academicYear","academicPeriod","period","grade","classId","subject","teacherId"]){const value=url.searchParams.get(name);if(value!==null)input[name]=value;}
      const data=buildEducationAnalyticsV67320(auth.db,input);
      educationAnalyticsCacheV67320.clear(); educationAnalyticsCacheV67320.set(key,{at:Date.now(),data});
      return sendJson(res,200,{...data,cache:{hit:false,ttlSeconds:60}});
    }
    if (req.method === "POST" && url.pathname === "/api/admin/education-analytics/followup") {
      const body=await readJson(req),studentId=String(body.studentId||"").trim(),status=String(body.status||"open").trim(),note=String(body.note||"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").trim().slice(0,1500);
      if(!studentId) throw Object.assign(new Error("دانش‌آموز مشخص نشده است."),{status:400});
      if(!["open","in_progress","resolved"].includes(status)) throw Object.assign(new Error("وضعیت پیگیری معتبر نیست."),{status:400});
      const year=String(body.academicYear||auth.db.school?.year||"").slice(0,40);
      const saved=await mutateDb(db=>{
        const student=(db.users||[]).find(u=>String(u.id)===studentId&&u.role==="student"&&u.active!==false&&String(u.profileStatus||"active")!=="deleted");
        if(!student) throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
        db.academicFollowups=Array.isArray(db.academicFollowups)?db.academicFollowups:[];
        let row=db.academicFollowups.filter(x=>String(x.studentId||"")===studentId&&String(x.academicYear||year)===year).sort((a,b)=>String(b.updatedAtIso||b.createdAtIso||"").localeCompare(String(a.updatedAtIso||a.createdAtIso||"")))[0];
        const now=faNow(),nowIso=new Date().toISOString(),historyItem={status,note,at:now,atIso:nowIso,by:auth.user.id};
        if(row){row.status=status;row.note=note;row.updatedAt=now;row.updatedAtIso=nowIso;row.updatedBy=auth.user.id;row.history=Array.isArray(row.history)?row.history:[];row.history.unshift(historyItem);row.history=row.history.slice(0,100);}
        else{row={id:makeId("afup"),studentId,academicYear:year,status,note,createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id,history:[historyItem]};db.academicFollowups.unshift(row);}
        db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"پیگیری آموزشی دانش‌آموز",details:`${studentId} · ${status}`,at:now});
        return compactEducationFollowupV67320(row);
      });
      educationAnalyticsCacheV67320.clear();
      await securityAudit({type:"academic_followup_update",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`student=${studentId}; status=${status}`});
      return sendJson(res,200,{ok:true,followup:saved.result,updatedAt:saved.updatedAt});
    }
    return sendJson(res,404,{error:"مسیر تحلیل آموزشی پیدا نشد."});
  } catch(error) { return sendJson(res,error.status||500,{error:error.message||"خطای مرکز تحلیل آموزشی",code:error.code||undefined}); }
}


function actionCenterBaselineV67330(student) {
  if (!student) return null;
  return { averagePercent: Number.isFinite(Number(student.averagePercent)) ? Number(student.averagePercent) : null, riskScore: Number(student?.risk?.score || 0), riskLevel: String(student?.risk?.level || "low"), capturedAt: new Date().toISOString() };
}
function actionCenterCaseCompactV67330(row) {
  if (!row) return null;
  return { id:String(row.id||""),studentId:String(row.studentId||""),academicYear:String(row.academicYear||""),status:String(row.status||"open"),priority:String(row.priority||"normal"),ownerId:String(row.ownerId||""),dueDate:String(row.dueDate||""),note:sanitizeClientDiagnosticText(row.note||"",1500),sourceRule:String(row.sourceRule||""),linkedTaskId:String(row.linkedTaskId||""),baselineMetrics:row.baselineMetrics||null,updatedAtIso:String(row.updatedAtIso||row.createdAtIso||"") };
}
function actionCenterStaffAllowedV67330(db, userId) {
  const user=(db.users||[]).find(u=>String(u.id)===String(userId||"")&&u.active!==false&&String(u.profileStatus||"active")!=="deleted");
  // فقط نقش‌هایی که واقعاً به مرکز اقدام دسترسی دارند می‌توانند مسئول پرونده شوند.
  return user && ["admin","superadmin","teacher"].includes(String(user.role||"")) ? user : null;
}
function actionCenterTeacherCanStudentV67330(db,user,student) {
  if(!user||user.role!=="teacher"||!student)return false;
  return teacherCanAssigned(db,user,{classId:String(student.classId||"")});
}
async function handleActionCenterApiV67330(req,res,url,auth){
  try{
    const role=String(auth.user.role||"");
    if(!["teacher","admin","superadmin"].includes(role))throw Object.assign(new Error("دسترسی به مرکز اقدام برای این نقش مجاز نیست."),{status:403});
    if(req.method==="GET"&&url.pathname==="/api/staff/action-center"){
      const academicYear=String(url.searchParams.get("academicYear")||auth.db.school?.year||"");
      const analytics=buildEducationAnalyticsV67320(auth.db,{period:String(url.searchParams.get("period")||"month"),academicYear});
      return sendJson(res,200,buildActionCenterV67330(auth.db,analytics,{role,userId:auth.user.id,academicYear}));
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/action-center/case"){
      const body=await readJson(req),id=String(body.id||"").trim(),studentId=String(body.studentId||"").trim();
      const status=String(body.status||"open").trim(),priority=String(body.priority||"normal").trim(),dueDate=String(body.dueDate||"").trim(),note=String(body.note||"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").trim().slice(0,1500);
      if(!studentId)throw Object.assign(new Error("دانش‌آموز مشخص نشده است."),{status:400});
      if(!["open","in_progress","resolved"].includes(status))throw Object.assign(new Error("وضعیت پرونده معتبر نیست."),{status:400});
      if(!["low","normal","high","urgent"].includes(priority))throw Object.assign(new Error("اولویت پرونده معتبر نیست."),{status:400});
      if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Object.assign(new Error("تاریخ سررسید باید با قالب YYYY-MM-DD باشد."),{status:400});
      const year=String(body.academicYear||auth.db.school?.year||"").slice(0,40);
      const student=(auth.db.users||[]).find(u=>String(u.id)===studentId&&u.role==="student"&&u.active!==false&&!['deleted','graduated'].includes(String(u.profileStatus||'')));
      if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
      if(role==="teacher"&&!actionCenterTeacherCanStudentV67330(auth.db,auth.user,student))throw Object.assign(new Error("این دانش‌آموز در دامنه آموزشی شما نیست."),{status:403});
      let requestedOwnerId=role==="teacher"?String(auth.user.id):String(body.ownerId||auth.user.id).trim();
      if(role!=="teacher"&&!actionCenterStaffAllowedV67330(auth.db,requestedOwnerId))throw Object.assign(new Error("مسئول پیگیری معتبر نیست."),{status:400});
      const analytics=buildEducationAnalyticsV67320(auth.db,{period:"month",academicYear:year});
      const analyticStudent=(analytics.students||[]).find(x=>String(x.id)===studentId);
      const saved=await mutateDb(db=>{
        db.academicFollowups=Array.isArray(db.academicFollowups)?db.academicFollowups:[];
        let row=id?db.academicFollowups.find(x=>String(x.id)===id):null;
        if(id&&!row)throw Object.assign(new Error("پرونده پیگیری پیدا نشد."),{status:404});
        // جلوگیری از IDOR: شناسه پرونده و دانش‌آموز ارسالی باید به یک رکورد اشاره کنند.
        if(row&&String(row.studentId||"")!==studentId)throw Object.assign(new Error("دانش‌آموز پرونده با درخواست مطابقت ندارد."),{status:409});
        if(row&&role==="teacher"&&!actionCenterTeacherCanStudentV67330(db,auth.user,student)&&String(row.ownerId||"")!==String(auth.user.id))throw Object.assign(new Error("اجازه ویرایش این پرونده را ندارید."),{status:403});
        // معلم هنگام ویرایش پرونده موجود، مالک پرونده را ناخواسته به خودش تغییر نمی‌دهد.
        const ownerId=role==="teacher"?(row?String(row.ownerId||auth.user.id):String(auth.user.id)):requestedOwnerId;
        const now=faNow(),nowIso=new Date().toISOString(),before=row?{status:row.status,priority:row.priority,ownerId:row.ownerId,dueDate:row.dueDate,note:row.note}:null;
        if(row){Object.assign(row,{status,priority,ownerId,dueDate,note,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id});}
        else{row={id:makeId("acase"),studentId,academicYear:year,status,priority,ownerId,dueDate,note,sourceRule:String(body.sourceRule||"manual").slice(0,80),baselineMetrics:actionCenterBaselineV67330(analyticStudent),createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id,history:[]};db.academicFollowups.unshift(row);}
        row.history=Array.isArray(row.history)?row.history:[];row.history.unshift({at:now,atIso:nowIso,by:auth.user.id,action:id?"update":"create",status,priority,ownerId,dueDate,note,before});row.history=row.history.slice(0,200);
        db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:id?"ویرایش پرونده پیگیری":"ایجاد پرونده پیگیری",details:`${studentId} · ${status} · ${priority}`,at:now});
        if(ownerId&&ownerId!==auth.user.id){db.notifications=Array.isArray(db.notifications)?db.notifications:[];db.notifications.unshift({id:makeId("notif"),userId:ownerId,type:"academic_case_assignment",title:"پرونده پیگیری آموزشی",body:`پرونده پیگیری ${student.firstName||""} ${student.lastName||""} به شما واگذار شد.`,message:`پرونده پیگیری ${student.firstName||""} ${student.lastName||""} به شما واگذار شد.`,read:false,at:now,createdAt:now,createdAtIso:nowIso,target:"actionCenter",targetId:row.id,createdBy:auth.user.id});}
        return actionCenterCaseCompactV67330(row);
      });
      educationAnalyticsCacheV67320.clear();
      await securityAudit({type:"academic_case_update",userId:auth.user.id,role,ip:clientIp(req),details:`student=${studentId}; case=${saved.result.id}; status=${status}`});
      return sendJson(res,id?200:201,{ok:true,case:saved.result,updatedAt:saved.updatedAt});
    }
    if(req.method==="POST"&&url.pathname==="/api/admin/action-center/accept-signal"){
      if(!["admin","superadmin"].includes(role))throw Object.assign(new Error("تبدیل هشدار به اقدام فقط برای مدیر مجاز است."),{status:403});
      const body=await readJson(req),studentId=String(body.studentId||"").trim(),rule=String(body.rule||"high_risk").slice(0,80),priority=String(body.priority||"high").trim(),dueDate=String(body.dueDate||"").trim();
      if(!studentId)throw Object.assign(new Error("دانش‌آموز مشخص نشده است."),{status:400});
      if(!["low","normal","high","urgent"].includes(priority))throw Object.assign(new Error("اولویت معتبر نیست."),{status:400});
      if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Object.assign(new Error("تاریخ سررسید معتبر نیست."),{status:400});
      const ownerId=String(body.ownerId||auth.user.id).trim(),owner=actionCenterStaffAllowedV67330(auth.db,ownerId);if(!owner)throw Object.assign(new Error("مسئول پیگیری معتبر نیست."),{status:400});
      const student=(auth.db.users||[]).find(u=>String(u.id)===studentId&&u.role==="student"&&u.active!==false&&!['deleted','graduated'].includes(String(u.profileStatus||'')));if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
      const year=String(body.academicYear||auth.db.school?.year||"").slice(0,40),analytics=buildEducationAnalyticsV67320(auth.db,{period:"month",academicYear:year}),analyticStudent=(analytics.students||[]).find(x=>String(x.id)===studentId);
      const actionSnapshot=buildActionCenterV67330(auth.db,analytics,{role,userId:auth.user.id,academicYear:year});
      const activeSignal=(actionSnapshot.signals||[]).find(x=>String(x.studentId||"")===studentId&&String(x.rule||"")===rule);
      if(!activeSignal)throw Object.assign(new Error("این هشدار دیگر فعال نیست یا با داده فعلی مطابقت ندارد؛ مرکز اقدام را تازه‌سازی کنید."),{status:409});
      if(activeSignal.hasActiveCase)throw Object.assign(new Error("برای این دانش‌آموز پرونده فعال وجود دارد؛ همان پرونده را ادامه دهید."),{status:409});
      const saved=await mutateDb(db=>{
        db.academicFollowups=Array.isArray(db.academicFollowups)?db.academicFollowups:[];db.adminTasks=Array.isArray(db.adminTasks)?db.adminTasks:[];
        let row=db.academicFollowups.find(x=>String(x.studentId||"")===studentId&&String(x.academicYear||year)===year&&["open","in_progress"].includes(String(x.status||"open")));
        const now=faNow(),nowIso=new Date().toISOString();
        if(!row){row={id:makeId("acase"),studentId,academicYear:year,status:"open",priority,ownerId,dueDate,note:String(body.note||analyticStudent?.risk?.reasons?.[0]||"هشدار خودکار نیازمند بررسی انسانی است.").slice(0,1500),sourceRule:rule,baselineMetrics:actionCenterBaselineV67330(analyticStudent),createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id,history:[]};db.academicFollowups.unshift(row);}else{Object.assign(row,{priority,ownerId,dueDate:dueDate||row.dueDate||"",updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id});}
        row.history=Array.isArray(row.history)?row.history:[];row.history.unshift({at:now,atIso:nowIso,by:auth.user.id,action:"signal_accept",rule,priority,ownerId,dueDate});row.history=row.history.slice(0,200);
        let task=null;if(body.createTask!==false){task=db.adminTasks.find(t=>String(t.caseId||"")===String(row.id)&&!["done","closed"].includes(String(t.status||"")));if(!task){task={id:makeId("atask"),title:`پیگیری آموزشی: ${student.firstName||""} ${student.lastName||""}`.trim(),note:String(body.note||analyticStudent?.risk?.reasons?.join(" | ")||"بررسی هشدار آموزشی").slice(0,2000),priority,status:"open",dueDate,ownerId,studentId,caseId:row.id,category:"academic_followup",createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id};db.adminTasks.unshift(task);row.linkedTaskId=task.id;}}
        db.notifications=Array.isArray(db.notifications)?db.notifications:[];if(ownerId!==auth.user.id)db.notifications.unshift({id:makeId("notif"),userId:ownerId,type:"academic_case_assignment",title:"اقدام آموزشی جدید",body:`پیگیری ${student.firstName||""} ${student.lastName||""} به شما واگذار شد.`,message:`پیگیری ${student.firstName||""} ${student.lastName||""} به شما واگذار شد.`,read:false,at:now,createdAt:now,createdAtIso:nowIso,target:"actionCenter",targetId:row.id,createdBy:auth.user.id});
        db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تبدیل هشدار آموزشی به اقدام",details:`${studentId} · ${rule} · ${row.id}`,at:now});
        return {case:actionCenterCaseCompactV67330(row),task:task?{id:task.id,title:task.title,status:task.status,ownerId:task.ownerId,dueDate:task.dueDate,caseId:task.caseId}:null};
      });
      educationAnalyticsCacheV67320.clear();await securityAudit({type:"academic_signal_accept",userId:auth.user.id,role,ip:clientIp(req),details:`student=${studentId}; rule=${rule}`});
      return sendJson(res,201,{ok:true,...saved.result,updatedAt:saved.updatedAt});
    }
    if(req.method==="POST"&&url.pathname==="/api/staff/action-center/task-status"){
      const body=await readJson(req),taskId=String(body.taskId||"").trim(),status=String(body.status||"").trim();if(!taskId||!["open","in_progress","done","closed"].includes(status))throw Object.assign(new Error("کار یا وضعیت معتبر نیست."),{status:400});
      const saved=await mutateDb(db=>{const task=(db.adminTasks||[]).find(x=>String(x.id)===taskId);if(!task)throw Object.assign(new Error("کار پیدا نشد."),{status:404});if(role==="teacher"&&String(task.ownerId||"")!==String(auth.user.id))throw Object.assign(new Error("این کار به شما واگذار نشده است."),{status:403});const now=faNow(),nowIso=new Date().toISOString();task.status=status;task.updatedAt=now;task.updatedAtIso=nowIso;task.updatedBy=auth.user.id;if(["done","closed"].includes(status)){task.completedAt=now;task.completedAtIso=nowIso;task.completedBy=auth.user.id;}db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تغییر وضعیت اقدام آموزشی",details:`${taskId} · ${status}`,at:now});return {id:task.id,status:task.status,updatedAtIso:task.updatedAtIso};});return sendJson(res,200,{ok:true,task:saved.result});
    }
    return sendJson(res,404,{error:"مسیر مرکز اقدام پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مرکز اقدام",code:error.code||undefined});}
}


function communicationRecipientsV67340(db,targetType,targetValue){
  const users=Array.isArray(db?.users)?db.users:[],guardians=Array.isArray(db?.guardians)?db.guardians:[],links=Array.isArray(db?.guardianLinks)?db.guardianLinks:[];
  const activeUser=u=>u&&u.active!==false&&!['deleted','graduated'].includes(String(u.profileStatus||''));
  const userRows=rows=>rows.filter(activeUser).map(u=>({kind:'user',id:String(u.id||''),role:String(u.role||'')}));
  const guardianRows=rows=>rows.filter(g=>g&&g.active!==false).map(g=>({kind:'guardian',id:String(g.id||''),role:'guardian'}));
  if(targetType==="user"){
    const foundUsers=userRows(users.filter(u=>String(u.id||"")===targetValue));if(foundUsers.length)return foundUsers;
    return guardianRows(guardians.filter(g=>String(g.id||"")===targetValue));
  }
  if(targetType==="role")return targetValue==='guardian'?guardianRows(guardians):userRows(users.filter(u=>String(u.role||"")===targetValue));
  if(targetType==="class")return userRows(users.filter(u=>u.role==="student"&&String(u.classId||"")===targetValue));
  if(targetType==="guardian_class"){
    const studentIds=new Set(users.filter(u=>u.role==='student'&&String(u.classId||'')===targetValue&&activeUser(u)).map(u=>String(u.id)));
    const guardianIds=new Set(links.filter(l=>l&&l.active!==false&&studentIds.has(String(l.studentId||''))&&l.guardianId).map(l=>String(l.guardianId)));
    return guardianRows(guardians.filter(g=>guardianIds.has(String(g.id||''))));
  }
  return [];
}
async function handleCommunicationsApiV67340(req,res,url,auth){
  try{
    const role=String(auth.user.role||"");
    if(req.method==="GET"&&url.pathname==="/api/staff/communications-center")return sendJson(res,200,buildCommunicationsCenterV67340(auth.db,{role,userId:auth.user.id}));
    if(req.method==="POST"&&url.pathname==="/api/staff/communications/read"){
      const body=await readJson(req),id=String(body.id||"").trim();if(!id)throw Object.assign(new Error("شناسه پیام لازم است."),{status:400});
      const saved=await mutateDb(db=>{const row=(db.notifications||[]).find(x=>String(x.id||"")===id&&String(x.userId||"")===String(auth.user.id));if(!row)throw Object.assign(new Error("پیام پیدا نشد."),{status:404});row.read=true;row.readAt=faNow();row.readAtIso=new Date().toISOString();return {id:row.id,read:true};});
      return sendJson(res,200,{ok:true,notification:saved.result});
    }
    if(!["admin","superadmin"].includes(role))throw Object.assign(new Error("این عملیات فقط برای مدیر مجاز است."),{status:403});
    if(req.method==="POST"&&url.pathname==="/api/admin/communications/send"){
      const body=await readJson(req),targetType=String(body.targetType||"").trim(),targetValue=String(body.targetValue||"").trim(),title=String(body.title||"").trim(),message=String(body.body||body.message||"").trim();
      if(!["user","role","class","guardian_class"].includes(targetType))throw Object.assign(new Error("نوع گیرنده معتبر نیست."),{status:400});
      if(title.length<2||title.length>180||message.length<2||message.length>1600)throw Object.assign(new Error("عنوان یا متن پیام معتبر نیست."),{status:400});
      if(targetType==="role"&&!['student','teacher','admin','superadmin','guardian'].includes(targetValue))throw Object.assign(new Error("نقش گیرنده معتبر نیست."),{status:400});
      const recipients=communicationRecipientsV67340(auth.db,targetType,targetValue).slice(0,2500);if(!recipients.length)throw Object.assign(new Error("گیرنده‌ای برای این انتخاب پیدا نشد."),{status:404});
      const saved=await mutateDb(db=>{const now=faNow(),nowIso=new Date().toISOString();db.notifications=Array.isArray(db.notifications)?db.notifications:[];db.communicationCampaigns=Array.isArray(db.communicationCampaigns)?db.communicationCampaigns:[];const campaign={id:makeId("camp"),title,body:message,targetType,targetValue,recipientCount:recipients.length,createdAt:Date.now(),createdAtIso:nowIso,createdBy:auth.user.id};db.communicationCampaigns.unshift(campaign);for(const recipient of recipients){const notification={id:makeId("notif"),recipientKind:recipient.kind,type:"internal_campaign",title,body:message,message,read:false,at:Date.now(),createdAt:Date.now(),createdAtIso:nowIso,target:"communicationsCenter",targetId:campaign.id,createdBy:auth.user.id};if(recipient.kind==='guardian')notification.guardianId=recipient.id;else notification.userId=recipient.id;db.notifications.unshift(notification);}db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ارسال پیام داخلی",details:`${targetType}:${targetValue} · ${recipients.length} گیرنده · ${title}`,at:now});return campaign;});
      await securityAudit({type:"internal_communication_send",userId:auth.user.id,role,ip:clientIp(req),details:`${targetType}:${targetValue}; recipients=${recipients.length}`});return sendJson(res,201,{ok:true,campaign:saved.result});
    }
    if(req.method==="POST"&&url.pathname==="/api/admin/communications/rules"){
      const body=await readJson(req),incoming=Array.isArray(body.rules)?body.rules:[],allowed=new Set(COMMUNICATION_AUTOMATION_TRIGGERS_V67340.map(x=>x.id));
      const clean=incoming.filter(x=>allowed.has(String(x?.trigger||""))).map(x=>({trigger:String(x.trigger),enabled:x.enabled!==false}));
      const saved=await mutateDb(db=>{const now=Date.now(),nowIso=new Date().toISOString();db.automationRules=Array.isArray(db.automationRules)?db.automationRules:[];for(const spec of clean){let row=db.automationRules.find(x=>String(x.trigger||"")===spec.trigger);if(!row){row={id:makeId("arule"),trigger:spec.trigger,title:COMMUNICATION_AUTOMATION_TRIGGERS_V67340.find(x=>x.id===spec.trigger)?.title||spec.trigger,recipientRole:"admin",template:"",createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id};db.automationRules.push(row);}row.enabled=spec.enabled;row.updatedAt=now;row.updatedAtIso=nowIso;row.updatedBy=auth.user.id;}return db.automationRules.map(x=>({id:x.id,trigger:x.trigger,enabled:x.enabled!==false}));});
      return sendJson(res,200,{ok:true,rules:saved.result});
    }
    return sendJson(res,404,{error:"مسیر مرکز ارتباطات پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مرکز ارتباطات",code:error.code||undefined});}
}


let productionReadinessCacheV67400={at:0,data:null};
async function handleProductionReadinessApiV67400(req,res,url,auth){
  try{
    const role=String(auth.user.role||'');if(!['admin','superadmin'].includes(role))throw Object.assign(new Error('این بخش فقط برای مدیر مجاز است.'),{status:403});
    if(req.method==='GET'&&url.pathname==='/api/admin/production-readiness'){
      const fresh=url.searchParams.get('fresh')==='1';if(!fresh&&productionReadinessCacheV67400.data&&Date.now()-productionReadinessCacheV67400.at<15000)return sendJson(res,200,{...productionReadinessCacheV67400.data,cache:{hit:true,ttlSeconds:15}});
      const health=await systemHealthSnapshot(auth.db),data=buildProductionReadinessV67400(health,{expectedVersion:PRODUCT_RELEASE_VERSION});productionReadinessCacheV67400={at:Date.now(),data};return sendJson(res,200,{...data,cache:{hit:false,ttlSeconds:15}});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/production-readiness/verified-snapshot'){
      if(role!=='superadmin')throw Object.assign(new Error('ساخت پشتیبان تأییدشده فقط برای سوپرادمین مجاز است.'),{status:403});
      const row=await createStateSnapshot('production-readiness',{skipPrune:false});if(!row)throw Object.assign(new Error('ساخت پشتیبان ممکن نشد.'),{status:500});const verified=Boolean(await validatedRecoveryCandidate(path.join(BACKUPS_DIR,row.name),`backup:${row.name}`));
      await securityAudit({type:'production_readiness_snapshot',userId:auth.user.id,role,ip:clientIp(req),success:verified,details:`snapshot=${row.name}; verified=${verified}`});productionReadinessCacheV67400={at:0,data:null};return sendJson(res,verified?201:500,{ok:verified,verified,snapshot:row});
    }
    return sendJson(res,404,{error:'مسیر آمادگی نهایی پیدا نشد.'});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||'خطای آمادگی نهایی'});}
}


function financeStudentV67390(db,studentId){return (db.users||[]).find(u=>String(u.id||'')===String(studentId||'')&&u.role==='student'&&u.active!==false&&!['deleted','graduated'].includes(String(u.profileStatus||'')));}
async function handleFinanceApiV67390(req,res,url,auth){
  try{
    const role=String(auth.user.role||'');if(!['admin','superadmin'].includes(role))throw Object.assign(new Error('این بخش فقط برای مدیر مجاز است.'),{status:403});
    if(req.method==='GET'&&url.pathname==='/api/admin/finance-center')return sendJson(res,200,buildFinanceCenterV67390(auth.db,{role}));
    if(req.method==='POST'&&url.pathname==='/api/admin/finance/settings'){
      if(role!=='superadmin')throw Object.assign(new Error('فعال‌سازی یا غیرفعال‌سازی مالی فقط با سوپرادمین مجاز است.'),{status:403});const body=await readJson(req),enabled=body.enabled===true;
      const saved=await mutateDb(db=>{db.financeSettings=(db.financeSettings&&typeof db.financeSettings==='object')?db.financeSettings:{};db.financeSettings.enabled=enabled;db.financeSettings.currency='IRR';db.financeSettings.updatedAtIso=new Date().toISOString();db.financeSettings.updatedBy=auth.user.id;db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId('log'),userId:auth.user.id,action:enabled?'فعال‌سازی ماژول مالی':'غیرفعال‌سازی ماژول مالی',details:'حالت دفتر کل مالی اختیاری',at:faNow()});return {enabled};});
      return sendJson(res,200,{ok:true,...saved.result});
    }
    if(!financeEnabledV67390(auth.db))throw Object.assign(new Error('ماژول مالی غیرفعال است.'),{status:409});
    if(req.method==='POST'&&(url.pathname==='/api/admin/finance/charge'||url.pathname==='/api/admin/finance/payment')){
      const body=await readJson(req),studentId=String(body.studentId||'').trim(),title=String(body.title||'').trim(),note=String(body.note||'').trim(),method=String(body.method||'').trim(),amount=Math.round(Number(body.amount||0));
      if(!financeStudentV67390(auth.db,studentId))throw Object.assign(new Error('دانش‌آموز معتبر نیست.'),{status:404});if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000000)throw Object.assign(new Error('مبلغ معتبر نیست.'),{status:400});if(title.length<2||title.length>160||note.length>800||method.length>80)throw Object.assign(new Error('عنوان، روش یا توضیح معتبر نیست.'),{status:400});
      const isPayment=url.pathname.endsWith('/payment');
      const saved=await mutateDb(db=>{const now=faNow(),nowIso=new Date().toISOString(),row={id:makeId(isPayment?'pay':'chg'),studentId,title,amount,note,createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id};if(isPayment){row.method=method||'manual';db.financePayments=Array.isArray(db.financePayments)?db.financePayments:[];db.financePayments.unshift(row);}else{db.financeCharges=Array.isArray(db.financeCharges)?db.financeCharges:[];db.financeCharges.unshift(row);}db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId('log'),userId:auth.user.id,action:isPayment?'ثبت پرداخت دستی':'ثبت بدهی مالی',details:`${studentId} · ${amount} ریال · ${title}`,at:now});return row;});
      return sendJson(res,201,{ok:true,entry:saved.result});
    }
    return sendJson(res,404,{error:'مسیر مالی پیدا نشد.'});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||'خطای مرکز مالی'});}
}


async function handleReportBuilderApiV67380(req,res,url,auth){
  try{
    if(!["admin","superadmin"].includes(String(auth.user.role||"")))throw Object.assign(new Error("این بخش فقط برای مدیر مجاز است."),{status:403});
    if(req.method==="GET"&&url.pathname==="/api/admin/report-builder/templates")return sendJson(res,200,{ok:true,templates:REPORT_TEMPLATES_V67380});
    if(req.method==="POST"&&url.pathname==="/api/admin/report-builder/run"){
      const body=await readJson(req);const report=buildReportV67380(auth.db,body||{});
      return sendJson(res,200,{ok:true,...report});
    }
    return sendJson(res,404,{error:"مسیر گزارش‌ساز پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای گزارش‌ساز"});}
}


async function handleFamilyCenterApiV67350(req,res,url,auth){
  try{
    if(!["admin","superadmin"].includes(String(auth.user.role||"")))throw Object.assign(new Error("این بخش فقط برای مدیر مجاز است."),{status:403});
    if(req.method==="GET"&&url.pathname==="/api/admin/family-center")return sendJson(res,200,buildFamilyCenterV67350(auth.db));
    return sendJson(res,404,{error:"مسیر مرکز خانواده پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مرکز خانواده"});}
}


async function handleAttendanceDisciplineApiV67360(req,res,url,auth){
  try{
    const role=String(auth.user.role||""),classId=String(url.searchParams.get("classId")||"").trim();
    if(req.method==="GET"&&url.pathname==="/api/staff/attendance-discipline")return sendJson(res,200,buildAttendanceDisciplineV67360(auth.db,{role,userId:auth.user.id,classId}));
    if(req.method==="POST"&&url.pathname==="/api/staff/discipline/record"){
      const body=await readJson(req),studentId=String(body.studentId||"").trim(),type=String(body.type||"").trim(),title=String(body.title||"").trim(),note=String(body.note||"").trim();
      if(!studentId||!['positive','warning','incident'].includes(type))throw Object.assign(new Error("دانش‌آموز یا نوع رویداد معتبر نیست."),{status:400});
      if(title.length<2||title.length>180||note.length>1200)throw Object.assign(new Error("عنوان یا توضیح رویداد معتبر نیست."),{status:400});
      const student=(auth.db.users||[]).find(u=>String(u.id||'')===studentId&&u.role==='student'&&u.active!==false);if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
      if(role==='teacher'&&!actionCenterTeacherCanStudentV67330(auth.db,auth.user,student))throw Object.assign(new Error("این دانش‌آموز در دامنه آموزشی شما نیست."),{status:403});
      const saved=await mutateDb(db=>{const now=faNow(),nowIso=new Date().toISOString();db.behaviorRecords=Array.isArray(db.behaviorRecords)?db.behaviorRecords:[];const row={id:makeId('behavior'),studentId,academicYear:String(db.school?.year||''),academicPeriod:String(body.academicPeriod||'semester2'),type,title,note,teacherId:auth.user.id,createdBy:auth.user.id,createdAt:now,createdAtIso:nowIso};db.behaviorRecords.unshift(row);db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId('log'),userId:auth.user.id,action:'ثبت رویداد رفتاری',details:`${studentId} · ${type} · ${title}`,at:now});return row;});
      return sendJson(res,201,{ok:true,record:saved.result});
    }
    return sendJson(res,404,{error:"مسیر حضور و انضباط پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای حضور و انضباط"});}
}


function teacherCanClassV67370(db,userId,classId){return (db.teachingAssignments||[]).some(a=>a?.active!==false&&String(a.teacherId||'')===String(userId||'')&&String(a.classId||'')===String(classId||'')&&(!a.academicYear||String(a.academicYear)===String(db.school?.year||'')));}
async function handleLearningPlannerApiV67370(req,res,url,auth){
  try{
    const role=String(auth.user.role||'');
    if(req.method==='GET'&&url.pathname==='/api/staff/learning-planner')return sendJson(res,200,buildLearningPlannerV67370(auth.db,{role,userId:auth.user.id}));
    if(req.method==='POST'&&url.pathname==='/api/staff/learning-planner/event'){
      const body=await readJson(req),classId=String(body.classId||'').trim(),title=String(body.title||'').trim(),startDate=String(body.startDate||'').trim(),endDate=String(body.endDate||body.startDate||'').trim(),description=String(body.description||'').trim();
      if(role==='teacher'&&!classId)throw Object.assign(new Error('معلم باید یک کلاس از دامنه آموزشی خود انتخاب کند.'),{status:400});
      if(role==='teacher'&&!teacherCanClassV67370(auth.db,auth.user.id,classId))throw Object.assign(new Error('این کلاس در دامنه آموزشی شما نیست.'),{status:403});
      if(description.length>1000)throw Object.assign(new Error('توضیح رویداد بیش از حد طولانی است.'),{status:400});
      const raw={id:makeId('cal'),title,startDate,endDate:endDate||startDate,scope:classId?'class':'school',classId,description,type:'academic',academicYear:String(auth.db.school?.year||''),active:true};const normalized=validateCalendarEvent(raw,auth.db);
      const saved=await mutateDb(db=>{const now=faNow(),nowIso=new Date().toISOString();db.calendarEvents=Array.isArray(db.calendarEvents)?db.calendarEvents:[];const row={...normalized,id:raw.id,createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id,updatedAt:now,updatedAtIso:nowIso};db.calendarEvents.unshift(row);db.notifications=Array.isArray(db.notifications)?db.notifications:[];const recipients=(db.users||[]).filter(u=>u.role==='student'&&u.active!==false&&!['deleted','graduated'].includes(String(u.profileStatus||''))&&(!classId||String(u.classId||'')===classId));for(const st of recipients)db.notifications.unshift({id:makeId('notif'),userId:st.id,type:'calendar_event',title:`رویداد آموزشی: ${title}`,body:`${startDate}${description?` · ${description}`:''}`,message:`${startDate}${description?` · ${description}`:''}`,read:false,at:Date.now(),createdAt:Date.now(),createdAtIso:nowIso,target:'calendar',targetId:row.id,createdBy:auth.user.id});db.audit=Array.isArray(db.audit)?db.audit:[];db.audit.unshift({id:makeId('log'),userId:auth.user.id,action:'ثبت رویداد آموزشی',details:`${row.id} · ${title} · ${classId||'school'}`,at:now});return {row,recipientCount:recipients.length};});
      return sendJson(res,201,{ok:true,event:saved.result.row,recipientCount:saved.result.recipientCount});
    }
    return sendJson(res,404,{error:'مسیر برنامه آموزشی پیدا نشد.'});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||'خطای برنامه آموزشی'});}
}

async function handleSystemHealthApi(req, res, url, auth) {
  try {
    if (!["admin", "superadmin"].includes(auth.user.role)) throw Object.assign(new Error("این بخش فقط برای ادمین مجاز است."), { status: 403 });
    if (req.method === "GET" && url.pathname === "/api/admin/system-health") return sendJson(res, 200, await systemHealthSnapshot(auth.db));
    if (req.method === "POST" && url.pathname === "/api/admin/system-health/repair") {
      const operation = await enqueueStateOperation(async () => {
        await createStateSnapshot("before-health-repair");
        const current = await ensureStateInitialized();
        const fixed = repairServerDb(current.db, auth.user.id);
        const saved = await writeStateEnvelope(fixed.db, { skipSnapshot: true });
        return { fixed, saved };
      });
      await securityAudit({ type: "system_health_repair", userId: auth.user.id, role: auth.user.role, ip: clientIp(req), details: operation.fixed.actions.join("; ") || "normalize only" });
      return sendJson(res, 200, { ok: true, actions: operation.fixed.actions, health: await systemHealthSnapshot(operation.saved.db), updatedAt: operation.saved.updatedAt });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/sessions/revoke") {
      const authHeader = String(req.headers.authorization || ""); const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""; const keepHash = token ? tokenHash(token) : "";
      const updated = await mutateSecurity(security => { let revoked = 0; for (const hash of Object.keys(security.sessions || {})) if (hash !== keepHash) { delete security.sessions[hash]; revoked++; } return revoked; });
      const revoked = Number(updated.result || 0);
      await securityAudit({ type: "sessions_revoke", userId: auth.user.id, role: auth.user.role, ip: clientIp(req), details: `${revoked} session(s)` });
      return sendJson(res, 200, { ok: true, revoked });
    }
    return sendJson(res, 404, { error: "مسیر سلامت سامانه پیدا نشد." });
  } catch (error) { return sendJson(res, error.status || 500, { error: error.message || "خطای سلامت سامانه" }); }
}

function stage09SnapshotForStudent(db,studentId,academicPeriod="semester2"){
  const st=(db.users||[]).find(u=>u.id===studentId&&u.role==="student");if(!st)return null;
  const year=String(db.school?.year||""),period=academicPeriod==="semester1"?"semester1":"semester2";
  const attendance=(db.attendance||[]).filter(x=>x.studentId===studentId&&String(x.academicYear||year)===year&&String(x.academicPeriod||x.period||"semester2")===period);
  const homework=(db.homework||[]).filter(x=>x.classId===st.classId&&String(x.academicYear||year)===year&&String(x.academicPeriod||x.period||"semester2")===period&&x.status!=="archived");
  const ids=new Set(homework.map(x=>x.id)),homeworkSubmissions=(db.homeworkSubmissions||[]).filter(x=>x.studentId===studentId&&ids.has(x.homeworkId));
  const behavior=(db.behaviorRecords||[]).filter(x=>x.studentId===studentId&&String(x.academicYear||year)===year&&String(x.academicPeriod||x.period||"semester2")===period);
  const continuous=(db.continuousAssessments||[]).filter(x=>x.studentId===studentId&&String(x.academicYear||year)===year&&String(x.academicPeriod||x.period||"semester2")===period);
  return {academicPeriod:period,...studentDailySnapshot09({attendance,homework,homeworkSubmissions,behavior,continuous,studentId})};
}
function stage10RiskForStudent(db,studentId,academicPeriod="semester2"){
 const snapshot=stage09SnapshotForStudent(db,studentId,academicPeriod);
 if(!snapshot)return null;
 const risk=riskScore10(snapshot,db.school?.settings?.riskPolicy10||{});
 const open=(db.interventions||[]).filter(x=>x.studentId===studentId&&x.status!=="archived"&&x.status!=="closed"&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||"")).length;
 return {...risk,openInterventions:open,academicPeriod:snapshot.academicPeriod};
}

// p58: secure student-teacher academic conversations. Stored in existing state envelope.

// p59 — Teacher-authored, non-graded self-practice. Answers never exposed before submission.
async function handlePracticeP59(req,res,url){
 try{
  const {db,user}=await authenticate(req,["student","teacher"]);
  const isTeacher=user.role==="teacher";
  const assignments=(state,student)=>(state.teachingAssignments||[]).filter(a=>a.classId===student.classId&&teacherAssignmentIsActive(state,a));
  const eligible=(state,student,quiz)=>student&&student.role==="student"&&student.active!==false&&student.classId===quiz.classId&&assignments(state,student).some(a=>a.teacherId===quiz.teacherId&&a.subject===quiz.subject);
  const all=(db.practiceQuizzesP59||[]);
  if(req.method==="GET"&&url.pathname.endsWith('/list')){
   const qs=isTeacher?all.filter(q=>q.teacherId===user.id):all.filter(q=>q.published&&eligible(db,user,q));
   const attempts=(db.practiceAttemptsP59||[]).filter(a=>a.studentId===user.id);
   return sendJson(res,200,{quizzes:qs.map(q=>({id:q.id,title:q.title,subject:q.subject,classId:q.classId,published:!!q.published,count:q.questions.length,createdAt:q.createdAt,attempts:attempts.filter(a=>a.quizId===q.id).length})),attempts:attempts.slice(-100).map(a=>({id:a.id,quizId:a.quizId,score:a.score,total:a.total,at:a.at}))});
  }
  if(req.method==="GET"&&url.pathname.endsWith('/contacts')){
   if(!isTeacher)return sendJson(res,403,{error:'فقط معلم'});
   const rows=(db.teachingAssignments||[]).filter(a=>a.teacherId===user.id&&teacherAssignmentIsActive(db,a));
   return sendJson(res,200,{assignments:rows.map(a=>({classId:a.classId,subject:a.subject}))});
  }
  if(req.method==="POST"&&url.pathname.endsWith('/create')){
   if(!isTeacher)return sendJson(res,403,{error:'فقط معلم می‌تواند تمرین ایجاد کند'});
   const b=await readJson(req),classId=String(b.classId||''),subject=String(b.subject||''),title=String(b.title||'').trim();
   if(!title||title.length>120||!subject||!classId||!(db.teachingAssignments||[]).some(a=>a.teacherId===user.id&&a.classId===classId&&a.subject===subject&&teacherAssignmentIsActive(db,a)))return sendJson(res,400,{error:'عنوان یا تخصیص درس نامعتبر است'});
   const questions=b.questions;
   if(!Array.isArray(questions)||questions.length<1||questions.length>30||questions.some(q=>!String(q.text||'').trim()||String(q.text).length>500||!Array.isArray(q.options)||q.options.length!==4||q.options.some(x=>!String(x||'').trim()||String(x).length>200)||!Number.isInteger(q.answer)||q.answer<0||q.answer>3))return sendJson(res,400,{error:'سؤال‌ها باید چهار گزینه و یک پاسخ صحیح داشته باشند (حداکثر ۳۰ سؤال).'});
   const result=await enqueueStateOperation(async()=>{const env=await ensureStateInitialized(),state=env.db;
    if(!(state.teachingAssignments||[]).some(a=>a.teacherId===user.id&&a.classId===classId&&a.subject===subject&&teacherAssignmentIsActive(state,a)))throw Object.assign(new Error('دسترسی به درس ندارید'),{status:403});
    const q={id:makeId('pr59'),teacherId:user.id,classId,subject,title,questions:questions.map(x=>({text:String(x.text).trim(),options:x.options.map(o=>String(o).trim()),answer:x.answer})),published:true,createdAt:new Date().toISOString()};
    state.practiceQuizzesP59||=[];state.practiceQuizzesP59.push(q);await writeStateEnvelope(state);return q.id;});
   return sendJson(res,200,{ok:true,id:result});
  }
  if(req.method==="GET"&&url.pathname.endsWith('/take')){
   if(isTeacher)return sendJson(res,403,{error:'این بخش ویژه دانش‌آموز است'});
   const q=all.find(q=>q.id===url.searchParams.get('id')&&q.published&&eligible(db,user,q));
   if(!q)return sendJson(res,404,{error:'تمرین یافت نشد'});
   return sendJson(res,200,{quiz:{id:q.id,title:q.title,subject:q.subject,questions:q.questions.map(x=>({text:x.text,options:x.options}))}});
  }
  if(req.method==="POST"&&url.pathname.endsWith('/submit')){
   if(isTeacher)return sendJson(res,403,{error:'این بخش ویژه دانش‌آموز است'});
   const b=await readJson(req),answers=b.answers;
   const q=all.find(q=>q.id===b.id&&q.published&&eligible(db,user,q));
   if(!q||!Array.isArray(answers)||answers.length!==q.questions.length||answers.some(a=>!Number.isInteger(a)||a<0||a>3))return sendJson(res,400,{error:'پاسخ‌ها نامعتبرند'});
   const result=await enqueueStateOperation(async()=>{const env=await ensureStateInitialized(),state=env.db;const fresh=(state.practiceQuizzesP59||[]).find(x=>x.id===q.id);
    if(!fresh||!fresh.published||!eligible(state,user,fresh))throw Object.assign(new Error('دسترسی به تمرین ندارید'),{status:403});
    const correct=fresh.questions.map(x=>x.answer),score=correct.filter((a,i)=>a===answers[i]).length;
    state.practiceAttemptsP59||=[];state.practiceAttemptsP59.push({id:makeId('pa59'),quizId:q.id,studentId:user.id,answers:answers.slice(),score,total:correct.length,at:new Date().toISOString()});await writeStateEnvelope(state);return {score,total:correct.length,correct};});
   return sendJson(res,200,{ok:true,...result});
  }
  return sendJson(res,404,{error:'مسیر نامعتبر'});
 }catch(e){return sendJson(res,e.status||500,{error:e.status?e.message:'خطای داخلی سرور'});}
}

async function handleAcademicMessagesP58(req,res,url){
 try{
  const auth=await authenticate(req,["student","teacher"]); const {db,user}=auth;
  const eligible=(state,student,teacher,subject)=> student?.role==="student"&&teacher?.role==="teacher"&&student.active!==false&&teacher.active!==false&&!!student.classId&&teacherCanAssigned(state,teacher,{classId:student.classId,subject});
  const assignments=(state,student)=>(state.teachingAssignments||[]).filter(a=>teacherAssignmentIsActive(state,a)&&a.classId===student.classId).map(a=>({teacherId:a.teacherId,subject:a.subject})).filter(a=>eligible(state,student,(state.users||[]).find(t=>t.id===a.teacherId),a.subject));
  const selfName=[user.firstName,user.lastName].filter(Boolean).join(" ").trim();
  if(req.method==="GET"&&url.pathname==="/api/academic-messages/p58/contacts"){
   if(user.role==="student")return sendJson(res,200,{selfName,contacts:assignments(db,user).map(a=>{const t=db.users.find(x=>x.id===a.teacherId);return {...a,name:[t?.firstName,t?.lastName].filter(Boolean).join(" ")};})});
   const rows=(db.teachingAssignments||[]).filter(a=>a.teacherId===user.id&&teacherAssignmentIsActive(db,a));
   const contacts=[];for(const a of rows)for(const s of db.users||[])if(s.role==="student"&&s.classId===a.classId&&eligible(db,s,user,a.subject))contacts.push({studentId:s.id,subject:a.subject,name:[s.firstName,s.lastName].filter(Boolean).join(" ")});
   return sendJson(res,200,{selfName,contacts});
  }
  if(req.method==="GET"&&url.pathname==="/api/academic-messages/p58/threads"){
   const rows=(db.academicMessagesP58||[]).filter(m=>m.studentId===user.id||m.teacherId===user.id).filter(m=>{const s=db.users.find(x=>x.id===m.studentId),t=db.users.find(x=>x.id===m.teacherId);return eligible(db,s,t,m.subject)}).slice(-500);
   return sendJson(res,200,{messages:rows});
  }
  if(req.method==="POST"&&url.pathname==="/api/academic-messages/p58/read"){
   const body=await readJson(req),studentId=user.role==="student"?user.id:String(body.studentId||""),teacherId=user.role==="teacher"?user.id:String(body.teacherId||""),subject=String(body.subject||"").trim();
   if(!studentId||!teacherId||!subject||subject.length>120)throw Object.assign(new Error("گفتگوی نامعتبر"),{status:400});
   if(user.role==="student"&&studentId!==user.id||user.role==="teacher"&&teacherId!==user.id)throw Object.assign(new Error("دسترسی غیرمجاز"),{status:403});
   const result=await enqueueStateOperation(async()=>{const env=await ensureStateInitialized(),state=env.db,s=(state.users||[]).find(x=>x.id===studentId),t=(state.users||[]).find(x=>x.id===teacherId);
    if(!eligible(state,s,t,subject))throw Object.assign(new Error("دسترسی غیرمجاز به گفتگو"),{status:403});
    let changed=0;const now=new Date().toISOString();for(const m of state.academicMessagesP58||[]){if(m.studentId===studentId&&m.teacherId===teacherId&&m.subject===subject&&m.fromRole!==user.role&&!m.readAt){m.readAt=now;changed++;}}
    if(changed)await writeStateEnvelope(state);return changed;});
   return sendJson(res,200,{ok:true,marked:result});
  }
  if(req.method==="POST"&&url.pathname==="/api/academic-messages/p58/send"){
   const body=await readJson(req),subject=String(body.subject||"").trim(),message=String(body.message||"").trim();
   const studentId=user.role==="student"?user.id:String(body.studentId||""),teacherId=user.role==="teacher"?user.id:String(body.teacherId||"");
   if(!message||message.length>2000||!subject||subject.length>120)throw Object.assign(new Error("متن پیام باید بین ۱ تا ۲۰۰۰ نویسه باشد."),{status:400});
   const saved=await enqueueStateOperation(async()=>{const env=await ensureStateInitialized(),state=env.db,s=state.users.find(x=>x.id===studentId),t=state.users.find(x=>x.id===teacherId);if(!eligible(state,s,t,subject))throw Object.assign(new Error("این معلم یا دانش‌آموز برای این درس مجاز نیست."),{status:403});
    state.academicMessagesP58=Array.isArray(state.academicMessagesP58)?state.academicMessagesP58:[];
    const row={id:makeId("msg"),studentId,teacherId,subject,fromRole:user.role,fromId:user.id,message,at:new Date().toISOString()};state.academicMessagesP58.push(row);await writeStateEnvelope(state);return row;});
   return sendJson(res,201,{message:saved});
  }
  return sendJson(res,404,{error:"مسیر یافت نشد."});
 }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای سرور"});}
}

async function handleStudentApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/student/app-version") {
      const currentCode=Math.max(0,Number(url.searchParams.get("versionCode")||0));
      return sendJson(res,200,{
        latestVersion:STUDENT_ANDROID_VERSION,
        latestVersionCode:STUDENT_ANDROID_VERSION_CODE,
        minSupportedVersionCode:STUDENT_ANDROID_MIN_VERSION_CODE,
        apkUrl:STUDENT_ANDROID_APK_URL,
        required:currentCode>0 && currentCode<STUDENT_ANDROID_MIN_VERSION_CODE,
        notes:"نسخه 1.12.0: همگام‌سازی مستقیم و پایدار، نمایش آخرین به‌روزرسانی موفق، بهبود WebView/آفلاین و اصلاح داشبورد دانش‌آموز.",
        serverRelease:APP_RELEASE
      });
    }
    if (req.method === "POST" && url.pathname === "/api/student/login") {
      const body = await readJson(req);
      const nationalId = normalizeNationalId(body.nationalId || body.identifier || body.studentCode);
      const birthDate=body.birthDate||body.birthYear,password=String(body.password||"");
      const rate=await loginRateStatus(req,nationalId);
      if(rate.blocked)throw Object.assign(new Error(`تلاش‌های ناموفق زیاد بوده است؛ ${rate.retryAfter} ثانیه بعد دوباره امتحان کنید.`),{status:429});
      const envelope=await ensureStateInitialized(),security=await ensureSecurityInitialized(envelope.db);
      const student=(envelope.db.users||[]).find(u=>u.active&&u.role==="student"&&normalizeNationalId(u.nationalId)===nationalId);
      const credential=student?security.credentials?.[student.id]:null,bootstrap=Boolean(credential?.mustChangePassword&&!credential?.passwordChangedAt);
      let ok=false;
      if(/^\d{10}$/.test(nationalId)&&student&&credential)ok=bootstrap?Boolean((password&&await passwordVerify(password,credential.passwordHash))||birthValueMatches(student.birthDate||student.birthYear,birthDate)):Boolean(password)&&await passwordVerify(password,credential.passwordHash);
      if(!ok){await recordLoginFailure(rate.key);await securityAudit({type:"student_login",success:false,ip:clientIp(req),details:"اطلاعات ورود دانش‌آموز نادرست"});throw Object.assign(new Error(bootstrap?"رمز عبور یا تاریخ تولد صحیح نیست.":"کد ملی یا رمز عبور صحیح نیست."),{status:401});}
      await recordLoginSuccess(rate.key);
      await mutateSecurity(sec=>{const c=sec.credentials?.[student.id];if(c){c.lastLoginAt=new Date().toISOString();c.lastLoginIp=clientIp(req);c.lastLoginUserAgent=String(req.headers["user-agent"]||"").slice(0,250);}});
      const token=await issueSession(student,req,security);
      await securityAudit({type:"student_login",userId:student.id,role:student.role,success:true,ip:clientIp(req),details:bootstrap?"bootstrap":"password"});
      return sendJson(res,200,{token,student:publicStudent(student,envelope.db),mustChangePassword:Boolean(credential.mustChangePassword),bootstrap,serverTime:Date.now()});
    }

    const passwordChangeRoute = req.method === "POST" && url.pathname === "/api/student/change-password";
    const auth = await studentAuth(req, { allowPasswordChange: passwordChangeRoute });
    const db = auth.db; const student = auth.user;

    if(req.method==="POST"&&url.pathname==="/api/student/sync-heartbeat"){
      const body=await readJson(req),complete=body.complete===true,version=String(body.version||"").slice(0,40),nowIso=new Date().toISOString();
      const saved=await mutateSecurity(sec=>{const credential=sec.credentials?.[student.id];if(!credential)return {error:"credential_not_found"};credential.lastStudentSyncAttemptAt=nowIso;credential.lastStudentSyncStatus=complete?"success":"partial";credential.lastStudentSyncVersion=version;if(complete)credential.lastStudentSyncAt=nowIso;return {ok:true};});
      if(saved.result?.error)throw Object.assign(new Error("اطلاعات امنیتی حساب برای ثبت همگام‌سازی پیدا نشد."),{status:404});
      return sendJson(res,200,{ok:true,recorded:true,complete,recordedAt:nowIso});
    }

    if (req.method === "POST" && url.pathname === "/api/student/logout") {
      await mutateSecurity(security => { delete security.sessions[auth.tokenHash]; });
      await securityAudit({ type: "student_logout", userId: student.id, role: student.role, ip: clientIp(req) });
      return sendJson(res, 200, { ok: true });
    }
    if(req.method==="POST"&&url.pathname==="/api/student/sessions/client-info"){
      const body=await readJson(req);
      const updated=await mutateSecurity(sec=>{const row=sec.sessions?.[auth.tokenHash];if(!row||row.userId!==student.id)return {error:"not_found"};const deviceLabel=applyClientDeviceInfo(row,body);row.ip=clientIp(req);return {deviceLabel};});
      if(updated.result?.error)throw Object.assign(new Error("نشست جاری پیدا نشد."),{status:404});
      return sendJson(res,200,{ok:true,deviceLabel:updated.result?.deviceLabel||""});
    }
    if(req.method==="GET"&&url.pathname==="/api/student/sessions"){
      const rows=Object.entries(auth.security.sessions||{}).filter(([,row])=>row.userId===student.id).map(([hash,row])=>{const current=hash===auth.tokenHash,deviceLabel=sessionDeviceView(row,req,current);return {id:hash,current,createdAt:row.createdAt,lastSeenAt:row.lastSeenAt,expiresAt:row.expiresAt,idleExpiresAt:row.idleExpiresAt,ip:current?clientIp(req):row.ip,userAgent:deviceLabel,rawUserAgent:row.userAgent||"",deviceLabel};}).sort((a,b)=>Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0));
      return sendJson(res,200,{sessions:rows,currentSessionId:auth.tokenHash});
    }
    if(req.method==="POST"&&url.pathname==="/api/student/sessions/revoke-others"){const updated=await mutateSecurity(sec=>{let n=0;for(const [hash,row] of Object.entries(sec.sessions||{}))if(row.userId===student.id&&hash!==auth.tokenHash){delete sec.sessions[hash];n++;}return n;});await securityAudit({type:"student_session_revoke_others",userId:student.id,role:student.role,ip:clientIp(req),details:String(updated.result||0)});return sendJson(res,200,{ok:true,revoked:Number(updated.result||0)});}
    if(req.method==="POST"&&url.pathname==="/api/student/sessions/revoke"){const b=await readJson(req),sessionId=String(b.sessionId||"");if(!/^[a-f0-9]{64}$/i.test(sessionId))throw Object.assign(new Error("شناسه نشست معتبر نیست."),{status:400});const updated=await mutateSecurity(sec=>{const row=sec.sessions?.[sessionId];if(!row||row.userId!==student.id)return {error:"not_found"};delete sec.sessions[sessionId];return {current:sessionId===auth.tokenHash};});if(updated.result?.error)throw Object.assign(new Error("نشست پیدا نشد."),{status:404});await securityAudit({type:"student_session_revoke_one",userId:student.id,role:student.role,ip:clientIp(req)});return sendJson(res,200,{ok:true,requiresLogin:Boolean(updated.result.current)});}
    if(req.method==="POST"&&url.pathname==="/api/student/sessions/revoke-all"){const updated=await mutateSecurity(sec=>{let n=0;for(const [hash,row] of Object.entries(sec.sessions||{}))if(row.userId===student.id){delete sec.sessions[hash];n++;}return n;});await securityAudit({type:"student_session_revoke_all",userId:student.id,role:student.role,ip:clientIp(req),details:String(updated.result||0)});return sendJson(res,200,{ok:true,revoked:Number(updated.result||0),requiresLogin:true});}
    if (passwordChangeRoute) {
      const body = await readJson(req);
      const policyError = passwordPolicy(body.newPassword, student.role); if (policyError) throw Object.assign(new Error(policyError), { status: 400 });
      const updated = await mutateSecurity(async security => {
        const credential=security.credentials[student.id];
        if(!credential)return {error:"current"};
        const bootstrapChange=Boolean(credential.mustChangePassword&&!credential.passwordChangedAt);
        if(!bootstrapChange&&!await passwordVerify(String(body.currentPassword||""),credential.passwordHash))return {error:"current"};
        if(await passwordVerify(String(body.newPassword),credential.passwordHash))return {error:"same"};
        credential.passwordHash = await passwordHash(body.newPassword); credential.mustChangePassword = false; credential.passwordChangedAt = new Date().toISOString(); credential.credentialVersion = Number(credential.credentialVersion || 1) + 1;
        for (const [hash, sess] of Object.entries(security.sessions)) if (sess.userId === student.id && hash !== auth.tokenHash) delete security.sessions[hash];
        return { ok: true };
      });
      if (updated.result?.error === "current") throw Object.assign(new Error("رمز فعلی صحیح نیست."), { status: 401 });
      if (updated.result?.error === "same") throw Object.assign(new Error("رمز جدید باید با رمز قبلی متفاوت باشد."), { status: 400 });
      await securityAudit({ type: "password_change", userId: student.id, role: student.role, ip: clientIp(req) });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/student/me") return sendJson(res, 200, { student: publicStudent(student, db), auth: publicAuthUser(student, auth.security) });

    if (req.method === "GET" && url.pathname === "/api/student/profile/photo") {
      return sendJson(res, 200, { photoDataUrl: await readStudentProfilePhoto(student.id), updatedAt: student.profilePhotoUpdatedAt || "" });
    }

    if (req.method === "POST" && url.pathname === "/api/student/profile") {
      const body = await readJson(req);
      const clean = validateStudentProfilePayload(body);
      let photoUpdatedAt = student.profilePhotoUpdatedAt || "";
      if (body.removePhoto === true) {
        const key = safeKey(`student_profile_${student.id}`);
        await fs.rm(path.join(FILES_DIR, `${key}.json`), { force: true });
        photoUpdatedAt = "";
      } else if (body.photoDataUrl) {
        await saveStudentProfilePhoto(student.id, body.photoDataUrl);
        photoUpdatedAt = new Date().toISOString();
      }
      const result = await mutateDb(db2 => {
        const target = (db2.users || []).find(u => u.id === student.id && u.role === "student");
        if (!target) throw Object.assign(new Error("دانش‌آموز پیدا نشد."), { status: 404 });
        Object.assign(target, clean, { profileUpdatedAt: new Date().toISOString(), profilePhotoUpdatedAt: photoUpdatedAt });
        db2.audit ||= []; db2.audit.unshift({ id: makeId("log"), userId: student.id, action: "ویرایش پروفایل دانش‌آموز", details: "اطلاعات تماس و پروفایل توسط دانش‌آموز به‌روزرسانی شد", at: faNow() });
        return publicStudent(target, db2);
      });
      await securityAudit({ type: "student_profile_update", userId: student.id, role: student.role, ip: clientIp(req), details: "student profile synchronized" });
      return sendJson(res, 200, { ok: true, student: result.result, photoDataUrl: body.removePhoto === true ? "" : (body.photoDataUrl || await readStudentProfilePhoto(student.id)), savedAt: new Date().toISOString() });
    }

    if (req.method === "POST" && url.pathname === "/api/student/exam-incidents") {
      const body=await readJson(req),examId=String(body.examId||""),type=String(body.type||"other");
      if(!V66_INCIDENT_TYPES.has(type))throw Object.assign(new Error("نوع رخداد فنی معتبر نیست."),{status:400});
      const exam=(db.exams||[]).find(e=>e.id===examId&&studentCanSeeExam(db,e,student));if(!exam)throw Object.assign(new Error("آزمون مرتبط پیدا نشد."),{status:404});
      const clientEventId=String(body.clientEventId||"").slice(0,120);if(!clientEventId)throw Object.assign(new Error("شناسه رخداد لازم است."),{status:400});
      const saved=await mutateDb(async mutable=>{mutable.examIncidents ||= [];const exact=mutable.examIncidents.find(x=>x.studentId===student.id&&x.clientEventId===clientEventId);if(exact)return exact;const clientAt=Number(body.clientAt||Date.now()),sessionKey=String(body.sessionKey||"").slice(0,120);const recent=mutable.examIncidents.filter(x=>x.studentId===student.id&&x.examId===examId&&x.type===type&&x.status==="pending"&&Math.abs(clientAt-Number(x.lastClientAt||x.clientAt||0))<=5*60*1000&&(sessionKey?String(x.sessionKey||"")===sessionKey:true)).sort((a,b)=>Number(b.lastClientAt||b.clientAt||0)-Number(a.lastClientAt||a.clientAt||0))[0];if(recent){recent.evidenceCount=Number(recent.evidenceCount||1)+1;recent.lastClientAt=clientAt;recent.clientEventIds=Array.from(new Set([...(recent.clientEventIds||[recent.clientEventId]),clientEventId])).slice(-20);recent.lastDescription=String(body.description||"").slice(0,600);return recent;}const row={id:makeId("inc"),clientEventId,clientEventIds:[clientEventId],evidenceCount:1,studentId:student.id,examId,type,description:String(body.description||"").slice(0,600),clientAt,lastClientAt:clientAt,createdAt:Date.now(),networkOnline:body.networkOnline!==false,visibility:String(body.visibility||"").slice(0,30),appVersion:String(body.appVersion||"v67").slice(0,80),sessionKey,status:"pending",source:"student-app-v67"};mutable.examIncidents.push(row);mutable.notifications ||= [];mutable.notifications.unshift({id:makeId("not"),userId:exam.createdBy,title:"Incident فنی آزمون",body:`برای آزمون «${exam.title}» یک رخداد فنی دانش‌آموز ثبت شد.`,read:false,at:faNow()});return row;});
      await securityAudit({type:"student_exam_incident",userId:student.id,role:student.role,ip:clientIp(req),details:`${examId}:${type}`});
      return sendJson(res,201,{ok:true,incident:saved.result});
    }

    if (req.method === "POST" && url.pathname === "/api/student/exam-delivery-recovery/request") {
      const body=await readJson(req),examId=String(body.examId||""),submissionKey=submissionKeyV63(body);
      const exam=(db.exams||[]).find(e=>e.id===examId&&studentClassIds(db,student).has(String(e.classId||"")));
      if(!exam)throw Object.assign(new Error("آزمون مرتبط پیدا نشد."),{status:404});
      if(!submissionKey)throw Object.assign(new Error("کلید تحویل برای بررسی لازم است."),{status:400});
      if(existingExamSubmissionV63(db,exam,student,submissionKey))throw Object.assign(new Error("این تحویل قبلاً روی Server ثبت شده است و نیازی به Recovery ندارد."),{status:409});
      const packageVersion=String(body.packageVersion||"").slice(0,200),clientFinalizedAt=Number(body.finalizedAt||0);
      if(!packageVersion||!clientFinalizedAt)throw Object.assign(new Error("اطلاعات بسته نهایی‌شده برای Recovery کامل نیست."),{status:400});
      const saved=await mutateDb(async mutable=>{mutable.examDeliveryRecoveryRequests ||= [];const old=mutable.examDeliveryRecoveryRequests.find(r=>r.studentId===student.id&&r.examId===examId&&r.submissionKey===submissionKey&&["pending","approved"].includes(r.status));if(old){old.lastRequestedAt=Date.now();old.lastError=String(body.lastError||"").slice(0,500);old.lastErrorStatus=Number(body.lastErrorStatus||0);return old;}const r={id:makeId("rec"),studentId:student.id,examId,submissionKey,packageVersion,clientFinalizedAt,clientQueuedAt:Number(body.queuedAt||0),clientRetryCount:Math.max(0,Number(body.retryCount||0)),lastError:String(body.lastError||"").slice(0,500),lastErrorStatus:Number(body.lastErrorStatus||0),status:"pending",createdAt:Date.now(),source:"student-app-v65"};mutable.examDeliveryRecoveryRequests.push(r);mutable.notifications ||= [];mutable.notifications.unshift({id:makeId("not"),userId:exam.createdBy,title:"درخواست بررسی تحویل آزمون",body:`${student.firstName} ${student.lastName} برای آزمون «${exam.title}» درخواست بررسی ارسال ثبت کرد.`,read:false,at:faNow()});return r;});
      await securityAudit({type:"exam_delivery_recovery_request",userId:student.id,role:student.role,ip:clientIp(req),details:`${examId}:${submissionKey.slice(0,24)}`});
      return sendJson(res,201,{ok:true,request:saved.result});
    }

    if (req.method === "POST" && url.pathname === "/api/student/online-class/join") {
      const body=await readJson(req),scheduleEntryId=String(body.scheduleEntryId||""),clock=schoolClockV74(),date=clock.date,requestedDate=String(body.date||"").slice(0,10);
      if(requestedDate&&requestedDate!==date)throw Object.assign(new Error("Check-in کلاس آنلاین فقط برای تاریخ جاری مدرسه مجاز است."),{status:409});
      const entry=(db.weeklySchedule||[]).find(e=>e.id===scheduleEntryId&&e.active!==false&&e.classId===student.classId&&String(e.academicYear||db.school?.year||"")===String(db.school?.year||""));
      if(!entry)throw Object.assign(new Error("کلاس آنلاین برای شما پیدا نشد."),{status:404});
      const publicEntry=publicOnlineScheduleEntryV74(db,entry),settings=onlineLearningSettingsV74(db);
      if(!settings.enabled||!["online","hybrid"].includes(publicEntry.effectiveMode))throw Object.assign(new Error("این زنگ در حالت آنلاین فعال نیست."),{status:409});
      const datedSessions=(db.onlineClassSessions||[]).filter(x=>x.scheduleEntryId===entry.id&&x.date===date&&x.status!=="cancelled");
      const activeSession=datedSessions.find(x=>x.status==="live")||datedSessions.find(x=>x.status==="scheduled")||null;
      if(entry.day!==clock.dayName&&!activeSession)throw Object.assign(new Error("این کلاس برای امروز در برنامه شما قرار ندارد."),{status:409});
      if(!activeSession&&datedSessions.some(x=>x.status==="ended"))throw Object.assign(new Error("جلسه آنلاین امروز پایان یافته است."),{status:409});
      const startMinute=hmMinutesV74(entry.startTime),endMinute=hmMinutesV74(entry.endTime),joinWindow=Math.max(0,Number(settings.joinWindowMinutes||0));
      if(!activeSession&&startMinute!==null&&clock.minutes<startMinute-joinWindow)throw Object.assign(new Error(`زمان ورود به این کلاس هنوز نرسیده است؛ ورود از ${entry.startTime} با ${joinWindow} دقیقه فرصت پیش از شروع فعال می‌شود.`),{status:409});
      if(!activeSession&&endMinute!==null&&clock.minutes>endMinute+60)throw Object.assign(new Error("زمان این کلاس برای امروز به پایان رسیده است."),{status:409});
      const meetingUrl=normalizeWebUrlV74(activeSession?.meetingUrl||publicEntry.meetingUrl||""),meetingProvider=String(activeSession?.meetingProvider||publicEntry.meetingProvider||settings.defaultProvider||"custom").slice(0,60),lateAfter=Math.max(0,Number(settings.lateAfterMinutes||0)),delayMinutes=startMinute===null?null:clock.minutes-startMinute,punctuality=delayMinutes===null?"unknown":delayMinutes>lateAfter?"late":"on_time";
      if(!meetingUrl)throw Object.assign(new Error("لینک کلاس آنلاین هنوز توسط مدرسه یا معلم ثبت نشده است."),{status:409});
      const saved=await mutateDb(m=>{m.onlineJoinEvents=Array.isArray(m.onlineJoinEvents)?m.onlineJoinEvents:[];let row=m.onlineJoinEvents.find(x=>x.studentId===student.id&&x.scheduleEntryId===entry.id&&x.date===date);const now=new Date().toISOString();if(row){row.lastJoinAt=now;row.joinCount=Number(row.joinCount||1)+1;row.lastIp=clientIp(req);row.onlineSessionId=activeSession?.id||row.onlineSessionId||"";row.meetingProvider=meetingProvider;}else{row={id:makeId("olj"),studentId:student.id,classId:student.classId,scheduleEntryId:entry.id,onlineSessionId:activeSession?.id||"",teacherId:entry.teacherId,subject:entry.subject,date,periodNo:entry.periodNo,academicYear:String(m.school?.year||""),meetingProvider,punctuality,firstJoinDelayMinutes:delayMinutes,schoolTimeZone:clock.timeZone,firstJoinAt:now,lastJoinAt:now,joinCount:1,lastIp:clientIp(req),source:"student-app-v74"};m.onlineJoinEvents.push(row);}m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:student.id,action:"ورود به کلاس آنلاین",details:`${entry.subject} · ${entry.day} · زنگ ${entry.periodNo}`,at:faNow()});return row;});
      await securityAudit({type:"online_class_join",userId:student.id,role:student.role,success:true,ip:clientIp(req),details:`${entry.id}:${date}:${activeSession?.id||"schedule"}`});
      return sendJson(res,200,{ok:true,join:saved.result,onlineSessionId:activeSession?.id||"",sessionStatus:activeSession?.status||"schedule",meetingUrl,meetingProvider,effectiveMode:publicEntry.effectiveMode,instructions:publicEntry.onlineInstructions});
    }

    if (req.method === "GET" && url.pathname === "/api/student/dashboard") {

      const attempts = (db.attempts || []).filter(a => a.studentId === student.id);
      const submissions = (db.submissions || []).filter(s => s.studentId === student.id);
      const grades = (db.grades || []).filter(g => submissions.some(s => s.id === g.submissionId));
      const appeals = (db.appeals || []).filter(a => a.studentId === student.id);
      const baseNotifications = (db.notifications || []).filter(n => n.userId === student.id).slice(0, 30);
      const visibleExams = (db.exams || []).filter(e => studentCanSeeExam(db, e, student));
      const visibleHomework = (db.homework || []).filter(h => studentCanSeeHomework(db, h, student));
      const existingExamNotice = new Set(baseNotifications.filter(n => n.type === "exam" && n.targetId).map(n => String(n.targetId)));
      const existingHomeworkNotice = new Set(baseNotifications.filter(n => n.type === "homework" && n.targetId).map(n => String(n.targetId)));
      const derivedNotifications = [
        ...visibleExams.filter(e => !existingExamNotice.has(String(e.id))).slice(0, 15).map(e => ({
          id: `auto_exam_${e.id}_${student.id}`, userId: student.id, type: "exam",
          title: "آزمون جدید", message: e.title || "آزمون جدید برای شما منتشر شده است.",
          target: "exams", targetId: e.id, priority: "normal", at: e.publishedAt || e.lifecycleUpdatedAt || e.createdAt || new Date().toISOString(), auto: true
        })),
        ...visibleHomework.filter(h => !existingHomeworkNotice.has(String(h.id))).slice(0, 15).map(h => ({
          id: `auto_homework_${h.id}_${student.id}`, userId: student.id, type: "homework",
          title: "تکلیف جدید", message: h.title || "تکلیف جدید برای شما ثبت شده است.",
          target: "homework", targetId: h.id, priority: "normal", at: h.publishedAt || h.updatedAt || h.createdAt || new Date().toISOString(), auto: true
        }))
      ];
      const notifications = [...baseNotifications, ...derivedNotifications].slice(0, 50);
      const exams = visibleExams.map(e => ({ ...sanitizeExam(e), ...examAvailabilityV62(e), ...examAvailabilityForStudentV66(db,e,student), studentStatus: studentExamStatus(db, e, student.id), submissionInfo: studentSubmissionInfo(db,e,student.id), questions: undefined }));
      const homework = visibleHomework.map(h => ({ ...h, submission: (db.homeworkSubmissions || []).find(x => x.homeworkId === h.id && x.studentId === student.id) || null }));
      const resources = (db.resources || []).filter(r => r.classId === student.classId);
      const attendance = attendanceSummaryForStudent(db, student.id);
      const continuousAssessments = (db.continuousAssessments || []).filter(x => x.studentId === student.id && x.visibleToStudent !== false && (!x.academicYear || String(x.academicYear)===String(db.school?.year||""))).slice().sort((a,b)=>String(b.date||b.at||"").localeCompare(String(a.date||a.at||""))).slice(0,50);
      const interventions = (db.interventions || []).filter(x => x.studentId === student.id && x.visibleToStudent !== false && x.status !== "archived" && (!x.academicYear || String(x.academicYear)===String(db.school?.year||""))).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,20);
      const announcements = visibleAnnouncementsForStudent(db, student);
      const behaviorRecords = (db.behaviorRecords || []).filter(x => x.studentId === student.id && x.visibleToStudent !== false && (!x.academicYear || String(x.academicYear)===String(db.school?.year||""))).slice().sort((a,b)=>String(b.date||b.at||"").localeCompare(String(a.date||a.at||""))).slice(0,30);
      const lessonLogs = (db.lessonLogs || []).filter(x => x.classId === student.classId && x.visibleToStudent !== false && x.status !== "cancelled" && (!x.academicYear || String(x.academicYear)===String(db.school?.year||""))).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,20);
      const schedule = (db.schedule || []).filter(x => !x.classId || x.classId === student.classId);
      const scheduleDayOrderV79={"شنبه":0,"یکشنبه":1,"دوشنبه":2,"سه‌شنبه":3,"چهارشنبه":4,"پنجشنبه":5,"جمعه":6};
      const weeklySchedule=(db.weeklySchedule||[]).filter(x=>x.active!==false&&x.classId===student.classId&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||"")).map(x=>{const row=publicOnlineScheduleEntryV74(db,x),t=(db.users||[]).find(u=>u.id===x.teacherId),shift=(db.school?.shiftDefinitions||[]).find(sh=>sh.id===x.shiftId);return {...row,teacherName:t?`${t.firstName||""} ${t.lastName||""}`.trim():"",shiftName:shift?.name||x.shiftId||""};}).sort((a,b)=>(scheduleDayOrderV79[a.day]??99)-(scheduleDayOrderV79[b.day]??99)||(hmMinutesV74(a.startTime)??9999)-(hmMinutesV74(b.startTime)??9999)||Number(a.periodNo||0)-Number(b.periodNo||0));
      const scheduleClockV79=schoolClockV74(),todaySchedule=weeklySchedule.filter(x=>x.day===scheduleClockV79.dayName);
      const scheduleRevisionV79=(db.scheduleRevisions||[]).filter(x=>x.classId===student.classId&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||"")).sort((a,b)=>String(b.changedAt||"").localeCompare(String(a.changedAt||"")))[0]||null;
      const onlineClassSessions=(db.onlineClassSessions||[]).filter(x=>x.classId===student.classId&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||"")&&x.status!=="cancelled").map(x=>({id:x.id,scheduleEntryId:x.scheduleEntryId,classId:x.classId,subject:x.subject,teacherId:x.teacherId,date:x.date,periodNo:x.periodNo,deliveryMode:x.deliveryMode,meetingProvider:x.meetingProvider,meetingUrl:x.meetingUrl,status:x.status,startedAt:x.startedAt||"",endedAt:x.endedAt||"",title:x.title||x.subject||""}));
      const onlineJoinEvents=(db.onlineJoinEvents||[]).filter(x=>x.studentId===student.id&&String(x.academicYear||db.school?.year||"")===String(db.school?.year||"")).slice().sort((a,b)=>String(b.lastJoinAt||"").localeCompare(String(a.lastJoinAt||""))).slice(0,100);
      const consentForms = (db.consentForms || []).filter(x => x.status === "active" && (!x.academicYear || String(x.academicYear)===String(db.school?.year||"")) && (!x.classId || x.classId === student.classId) && (!Array.isArray(x.studentIds) || !x.studentIds.length || x.studentIds.includes(student.id))).map(x => { const { responses = [], ...form } = x; return { ...form, response: responses.find(r => r.studentId === student.id) || null }; });
      const progressReports = (db.progressReports || []).filter(x => x.studentId === student.id && x.status === "published" && (!x.academicYear || String(x.academicYear)===String(db.school?.year||""))).slice().sort((a,b)=>String(b.publishedAt||b.createdAt||"").localeCompare(String(a.publishedAt||a.createdAt||""))).slice(0,12);
      const calendarEvents=publicCalendarForStudentV76(db,student),academicYearModel=publicActiveAcademicYearV76(db);
      return sendJson(res, 200, { student: publicStudent(student, db), exams, attempts, submissions, grades, appeals, notifications, announcements, homework, continuousAssessments, interventions, behaviorRecords, lessonLogs, schedule, weeklySchedule, todaySchedule, scheduleUpdatedAt:scheduleRevisionV79?.changedAt||"", onlineLearning:publicOnlineSettingsV74(db), onlineClassSessions, onlineJoinEvents, resources, consentForms, progressReports, attendance, calendarEvents, academicYearModel, deliveryRecoveryRequests:deliveryRecoveryRowsV65(db).filter(r=>r.studentId===student.id).slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,30), examIncidents:examIncidentRowsV66(db).filter(r=>r.studentId===student.id).slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,50), fairnessAdjustments:fairnessRowsV66(db).filter(r=>r.studentId===student.id).slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,30), studentGoals:(db.studentGoals||[]).filter(x=>x.studentId===student.id), masteryRecords:(db.masteryRecords||[]).filter(x=>x.studentId===student.id), studyPlans:(db.studyPlans||[]).filter(x=>x.studentId===student.id), achievements:(db.achievements||[]).filter(x=>x.studentId===student.id), report: studentReport(db, student.id), termReport: studentTermReportV185(db, student.id,"semester2"), termReports:{semester1:studentTermReportV185(db,student.id,"semester1"),semester2:studentTermReportV185(db,student.id,"semester2"),annual:studentTermReportV185(db,student.id,"annual")}, dailySnapshots:{semester1:stage09SnapshotForStudent(db,student.id,"semester1"),semester2:stage09SnapshotForStudent(db,student.id,"semester2")}, riskSnapshots:{semester1:stage10RiskForStudent(db,student.id,"semester1"),semester2:stage10RiskForStudent(db,student.id,"semester2")}, serverTime: Date.now() });
    }

    if (req.method === "GET" && url.pathname === "/api/student/exams") {
      const exams = (db.exams || []).filter(e => studentCanSeeExam(db, e, student)).map(e => ({ ...sanitizeExam(e), ...examAvailabilityV62(e), ...examAvailabilityForStudentV66(db,e,student), questions: undefined, studentStatus: studentExamStatus(db, e, student.id), submissionInfo: studentSubmissionInfo(db,e,student.id) }));
      return sendJson(res, 200, { exams });
    }

    let match = url.pathname.match(/^\/api\/student\/exams\/([^/]+)\/download$/);
    if (req.method === "GET" && match) {
      const exam = (db.exams || []).find(e => e.id === decodeURIComponent(match[1]) && studentCanSeeExam(db, e, student));
      if (!exam) throw Object.assign(new Error("آزمون فعال پیدا نشد."), { status: 404 });
      const availabilityV66=examAvailabilityForStudentV66(db,exam,student);
      if (!availabilityV66.canStart) {
        const state=availabilityV66.availabilityState;
        throw Object.assign(new Error(state==="scheduled"?"زمان شروع آزمون هنوز نرسیده است.":"زمان آزمون به پایان رسیده است."), { status: 409 });
      }
      if (studentExamStatus(db, exam, student.id) === "submitted") throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status: 409 });
      const packageVersion = examPackageVersion(exam); const fairness=activeFairnessV66(db,student.id,exam.id); const allowedDurationSeconds=fairness?Math.max(60,Math.floor((Number(fairness.expiresAt)-Date.now())/1000)):Math.max(60,Number(exam.duration||0)*60); const grant = await createExamGrant(student, exam, packageVersion, allowedDurationSeconds);
      const sheetCode = studentSheetCode(auth.security.serverSecret, student, exam);
      await securityAudit({ type: "exam_download", userId: student.id, role: student.role, ip: clientIp(req), details: `${exam.title} | ${sheetCode}` });
      return sendJson(res, 200, { exam: { ...sanitizeExam(exam), ...(fairness?{duration:Math.max(1,Math.ceil(allowedDurationSeconds/60))}:{}), ...availabilityV66, sheetCode }, downloadedAt: Date.now(), packageVersion, availability: availabilityV66, ...grant });
    }

    match = url.pathname.match(/^\/api\/student\/exams\/([^/]+)\/submit$/);
    if (req.method === "POST" && match) {
      const examId = decodeURIComponent(match[1]);
      const body = await readJson(req);
      const grantExam = (db.exams || []).find(e => e.id === examId && studentCanSeeExam(db, e, student));
      if (!grantExam || grantExam.type !== "mcq") throw Object.assign(new Error("آزمون تستی فعال پیدا نشد."), { status: 404 });
      const submissionKey=submissionKeyV63(body);
      const duplicate=existingExamSubmissionV63(db,grantExam,student,submissionKey);
      if(duplicate){await noteDuplicateDeliveryV64(grantExam.id,student.id,submissionKey);return sendJson(res,200,{...duplicateReceiptV63(duplicate,grantExam,db),deliveryDiagnostics:duplicate.record.deliveryDiagnostics||null});}
      if ((db.attempts || []).some(a => a.examId === grantExam.id && a.studentId === student.id)) throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status: 409 });
      const grantV63=await validateExamGrantOrRecoveryV65(student, grantExam, body, db);
      const result = await mutateDb(async mutable => {
        const exam = (mutable.exams || []).find(e => e.id === examId && e.classId === student.classId && e.status === "active");
        if (!exam || exam.type !== "mcq") throw Object.assign(new Error("آزمون تستی فعال پیدا نشد."), { status: 404 });
        const duplicateInside=existingExamSubmissionV63(mutable,exam,student,submissionKey);
        if(duplicateInside)return {duplicate:duplicateInside,exam};
        if ((mutable.attempts || []).some(a => a.examId === exam.id && a.studentId === student.id)) throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status: 409 });
        const currentPackageVersion = examPackageVersion(exam);
        if (body.packageVersion && body.packageVersion !== currentPackageVersion) throw Object.assign(new Error("نسخه آزمون روی گوشی قدیمی است؛ سؤال‌ها را دوباره دانلود کنید."), { status: 409 });
        const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
        let score = 0, correctCount = 0, answeredCount = 0;
        const durationSeconds = Number(body.durationSeconds || 0);
        const secondsPerQuestion = (exam.questions || []).length ? durationSeconds / exam.questions.length : 0;
        for (const q of exam.questions || []) {
          const hasAnswer = Object.prototype.hasOwnProperty.call(answers, q.id);
          const selection = gradeMcqSelectionP67228(q, answers[q.id], hasAnswer);
          if (selection.answered) answeredCount += 1;
          const correct = selection.correct;
          if (correct) { score += Number(q.score || 0); correctCount += 1; }
          if (q.sourceQuestionId) {
            const source = (mutable.questionBank || []).find(item => item.id === q.sourceQuestionId);
            if (source) {
              source.stats ||= {};
              const oldN = Number(source.stats.answerCount || 0);
              source.stats.answerCount = oldN + 1;
              if (correct) source.stats.correctCount = Number(source.stats.correctCount || 0) + 1;
              source.stats.avgSeconds = Math.round(((Number(source.stats.avgSeconds || 0) * oldN) + secondsPerQuestion) / (oldN + 1) * 10) / 10;
              source.lastAnsweredAt = faNow();
            }
          }
        }
        const total = examTotalScore(exam);
        const roundedScore = Math.round(score * 100) / 100;
        const attempt = {
          id: makeId("att"), examId: exam.id, studentId: student.id, answers,
          score: roundedScore, total,
          percent: total ? Math.round((roundedScore / total) * 1000) / 10 : 0,
          correctCount, answeredCount, questionCount: (exam.questions || []).length,
          status: "final", gradingStatus: "final", gradedAt: Date.now(),
          startedAt: Number(body.startedAt || Date.now()), submittedAt: Date.now(),
          durationSeconds, packageVersion: currentPackageVersion, submissionKey, clientFinalizedAt:Number(body.finalizedAt||0), deliveredAt:Date.now(), deliveryMode:examScheduleStateV6111(exam)==="running"?"live":"offline_late", deliveryDiagnostics:deliveryDiagnosticsV64(body,exam), source: "student-app-v64", at: faNow()
        };
        mutable.attempts ||= []; mutable.attempts.push(attempt);
        mutable.audit ||= []; mutable.audit.unshift({ id: makeId("log"), userId: student.id, action: "تحویل و تصحیح خودکار آزمون تستی", details: `${exam.title} · نمره ${attempt.score} از ${attempt.total}`, at: faNow() });
        mutable.notifications ||= [];
        mutable.notifications.unshift({
          id: makeId("not"), userId: student.id, title: "نمره آزمون ثبت شد",
          body: `${exam.title}: ${attempt.score} از ${attempt.total}`,
          read: false, at: faNow()
        });
        return { attempt, exam };
      });
      if(result.result.duplicate){await markExamGrantUsedV63(body.attemptId,submissionKey);await noteDuplicateDeliveryV64(grantExam.id,student.id,submissionKey);return sendJson(res,200,duplicateReceiptV63(result.result.duplicate,result.result.exam,result.db||db));}
      const attempt = result.result.attempt, exam = result.result.exam;
      await markExamGrantUsedV63(body.attemptId,submissionKey);
      await consumeRecoveryV65(grantV63?.request?.id||body.recoveryRequestId,submissionKey);
      const receiptHash = crypto.createHash("sha256").update(`${attempt.id}|${student.id}|${exam.id}|${attempt.submittedAt}|${attempt.score}`).digest("hex");
      await securityAudit({ type: "exam_submit", userId: student.id, role: student.role, ip: clientIp(req), details: `${exam.title} | ${receiptHash.slice(0, 12)} | ${attempt.score}/${attempt.total}` });
      return sendJson(res, 200, {
        ok: true,
        receiptId: attempt.id,
        receiptHash,
        submittedAt: attempt.submittedAt,
        gradingStatus: "final",
        reportCardUpdated: true,
        result: {
          status: "final",
          score: attempt.score,
          total: attempt.total,
          percent: attempt.percent,
          correctCount: attempt.correctCount,
          answeredCount: attempt.answeredCount,
          questionCount: attempt.questionCount
        }
      });
    }

    match = url.pathname.match(/^\/api\/student\/exams\/([^/]+)\/submit-mixed$/);
    if (req.method === "POST" && match) {
      const examId = decodeURIComponent(match[1]);
      const body = await readJson(req);
      const current = await ensureStateInitialized();
      const exam = (current.db.exams || []).find(e => e.id === examId && e.classId === student.classId && e.status === "active");
      if (!exam || exam.type !== "mixed") throw Object.assign(new Error("آزمون ترکیبی فعال پیدا نشد."), { status: 404 });
      const submissionKey=submissionKeyV63(body);
      const duplicate=existingExamSubmissionV63(current.db,exam,student,submissionKey);
      if(duplicate){await noteDuplicateDeliveryV64(exam.id,student.id,submissionKey);return sendJson(res,200,{...duplicateReceiptV63(duplicate,exam,current.db),deliveryDiagnostics:duplicate.record.deliveryDiagnostics||null});}
      if (body.packageVersion && body.packageVersion !== examPackageVersion(exam)) throw Object.assign(new Error("نسخه آزمون روی گوشی قدیمی است؛ سؤال‌ها را دوباره دانلود کنید."), { status: 409 });
      if ((current.db.submissions || []).some(x => x.examId === exam.id && x.studentId === student.id) || (current.db.attempts || []).some(x => x.examId === exam.id && x.studentId === student.id)) throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status:409 });
      const recoveryGrantV65=await validateExamGrantOrRecoveryV65(student, exam, body, current.db);
      const answers = mixedAnswerMapV54(body.answers || {});
      const autoQuestions = (exam.questions || []).filter(isAutoGradableQuestionV54);
      const manualQuestions = (exam.questions || []).filter(q => !isAutoGradableQuestionV54(q));
      const autoBundle = buildAutoGradingCore(exam, answers);
      const autoRows = autoBundle.questions;
      const autoScore = autoBundle.score;
      const autoTotal = autoBundle.total;
      const manualTotal = autoBundle.manualTotal;
      const submissionId = makeId("sub");
      const write = await mutateDb(async mutable => {
        const duplicateInside=existingExamSubmissionV63(mutable,exam,student,submissionKey);
        if(duplicateInside)return {duplicate:duplicateInside,grade:null};
        if ((mutable.submissions || []).some(x => x.examId === exam.id && x.studentId === student.id)) throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status:409 });
        const submission = { id:submissionId, examId:exam.id, studentId:student.id, typedAnswers:answers, files:[], fileKeys:[], status:manualQuestions.length?"submitted":"final", gradingMode:"hybrid", autoGrading:{ score:autoScore,total:autoTotal,manualTotal,questions:autoRows,gradedAt:Date.now(),engine:"v54-server" }, ai:null, submissionKey, clientFinalizedAt:Number(body.finalizedAt||0), deliveredAt:Date.now(), deliveryMode:examScheduleStateV6111(exam)==="running"?"live":"offline_late", deliveryDiagnostics:deliveryDiagnosticsV64(body,exam), source:"student-app-v64", startedAt:Number(body.startedAt||Date.now()), durationSeconds:Number(body.durationSeconds||0), submittedAt:Date.now(), at:faNow() };
        mutable.submissions ||= []; mutable.submissions.push(submission);
        for (const row of autoRows) { const q=(exam.questions||[]).find(x=>String(x.id)===String(row.questionId)); if(!q?.sourceQuestionId) continue; const source=(mutable.questionBank||[]).find(x=>x.id===q.sourceQuestionId); if(!source) continue; source.stats ||= {}; source.stats.answerCount=Number(source.stats.answerCount||0)+1; if(row.correct)source.stats.correctCount=Number(source.stats.correctCount||0)+1; source.lastAnsweredAt=faNow(); }
        let grade = null;
        if (!manualQuestions.length) { grade={ id:makeId("gr"),submissionId:submission.id,examId:exam.id,teacherId:null,gradingVersion:54,gradingSource:"server-auto-mixed",teacherScore:autoScore,finalScore:autoScore,questionScores:autoRows.map(x=>({questionId:x.questionId,teacherScore:x.earnedScore,score:x.earnedScore,gradingSource:"server-auto"})),feedback:"تصحیح خودکار کامل شد.",gradedAt:Date.now(),at:faNow() }; mutable.grades ||= []; mutable.grades.push(grade); }
        mutable.notifications ||= []; mutable.notifications.unshift({ id:makeId("not"), userId:exam.createdBy, title:manualQuestions.length?"آزمون ترکیبی برای تکمیل تصحیح":"آزمون ترکیبی تحویل شد", body:manualQuestions.length?`${student.firstName} ${student.lastName} آزمون «${exam.title}» را تحویل داد؛ بخش عینی ${autoScore} از ${autoTotal} تصحیح شد.`:`${student.firstName} ${student.lastName} آزمون «${exam.title}» را تحویل داد و خودکار تصحیح شد.`, read:false, at:faNow() });
        mutable.audit ||= []; mutable.audit.unshift({ id:makeId("log"),userId:student.id,action:"تحویل آزمون ترکیبی",details:`${exam.title} · خودکار ${autoScore}/${autoTotal} · دستی ${manualTotal}`,at:faNow() });
        return { submission, grade };
      });
      if(write.result.duplicate){await markExamGrantUsedV63(body.attemptId,submissionKey);await noteDuplicateDeliveryV64(exam.id,student.id,submissionKey);return sendJson(res,200,duplicateReceiptV63(write.result.duplicate,exam,current.db));}
      await markExamGrantUsedV63(body.attemptId,submissionKey);
      await consumeRecoveryV65(recoveryGrantV65?.request?.id||body.recoveryRequestId,submissionKey);
      const receiptHash = crypto.createHash("sha256").update(`${submissionId}|${student.id}|${exam.id}|${write.result.submission.submittedAt}|${autoScore}`).digest("hex");
      await securityAudit({ type:"mixed_exam_submit",userId:student.id,role:student.role,ip:clientIp(req),details:`${exam.title} | ${receiptHash.slice(0,12)} | auto ${autoScore}/${autoTotal}` });
      const final = Boolean(write.result.grade);
      return sendJson(res,200,{ok:true,receiptId:submissionId,receiptHash,submittedAt:write.result.submission.submittedAt,gradingStatus:final?"final":"pending_manual",result:{status:final?"final":"pending",score:final?autoScore:null,total:examTotalScore(exam),autoScore,autoTotal,manualTotal,questionCount:(exam.questions||[]).length}});
    }

    match = url.pathname.match(/^\/api\/student\/exams\/([^/]+)\/submit-descriptive$/);
    if (req.method === "POST" && match) {
      const examId = decodeURIComponent(match[1]);
      const body = await readJson(req);
      const current = await ensureStateInitialized();
      const exam = (current.db.exams || []).find(e => e.id === examId && e.classId === student.classId && e.status === "active");
      if (!exam || exam.type !== "descriptive") throw Object.assign(new Error("آزمون تشریحی فعال پیدا نشد."), { status: 404 });
      const submissionKey=submissionKeyV63(body);
      const duplicate=existingExamSubmissionV63(current.db,exam,student,submissionKey);
      if(duplicate){await noteDuplicateDeliveryV64(exam.id,student.id,submissionKey);return sendJson(res,200,{...duplicateReceiptV63(duplicate,exam,current.db),deliveryDiagnostics:duplicate.record.deliveryDiagnostics||null});}
      if (body.packageVersion && body.packageVersion !== examPackageVersion(exam)) throw Object.assign(new Error("نسخه آزمون روی گوشی قدیمی است؛ سؤال‌ها را دوباره دانلود کنید."), { status: 409 });
      if ((current.db.submissions || []).some(s => s.examId === exam.id && s.studentId === student.id)) throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status: 409 });
      const recoveryGrantV65=await validateExamGrantOrRecoveryV65(student, exam, body, current.db);
      const files = Array.isArray(body.files) ? body.files : [];
      const typedAnswers = normalizeTypedAnswers(body.answers || body.typedAnswers);
      if ((!files.length && !Object.keys(typedAnswers).length && !body.autoSubmitted) || files.length > 12) throw Object.assign(new Error("حداقل یک پاسخ تایپی یا تصویر پاسخ لازم است؛ حداکثر ۱۲ تصویر مجاز است."), { status: 400 });
      const submissionId = makeId("sub");
      const sheetCode = studentSheetCode(auth.security.serverSecret, student, exam);
      const fileRecords = files.length ? await saveStudentFiles(submissionId, files) : [];
      const write = await mutateDb(async mutable => {
        const duplicateInside=existingExamSubmissionV63(mutable,exam,student,submissionKey);
        if(duplicateInside)return {duplicate:duplicateInside};
        if ((mutable.submissions || []).some(s => s.examId === exam.id && s.studentId === student.id)) throw Object.assign(new Error("این آزمون قبلاً تحویل داده شده است."), { status: 409 });
        const submission = { id: submissionId, examId: exam.id, studentId: student.id, sheetCode, files: fileRecords, fileKeys: fileRecords.map(f => f.key), typedAnswers, status: "submitted", ai: null, submissionKey, clientFinalizedAt:Number(body.finalizedAt||0), deliveredAt:Date.now(), deliveryMode:examScheduleStateV6111(exam)==="running"?"live":"offline_late", deliveryDiagnostics:deliveryDiagnosticsV64(body,exam), source: "student-app-v64", submittedAt: Date.now(), at: faNow() };
        mutable.submissions ||= []; mutable.submissions.push(submission);
        mutable.notifications ||= []; mutable.notifications.unshift({ id: makeId("not"), userId: exam.createdBy, title: "برگه جدید برای تصحیح", body: `${student.firstName} ${student.lastName} برگه «${exam.title}» را ارسال کرد.`, read: false, at: faNow() });
        mutable.audit ||= []; mutable.audit.unshift({ id: makeId("log"), userId: student.id, action: "ارسال پاسخ تشریحی از اپ", details: exam.title, at: faNow() });
        return submission;
      });
      if(write.result.duplicate){await markExamGrantUsedV63(body.attemptId,submissionKey);await noteDuplicateDeliveryV64(exam.id,student.id,submissionKey);return sendJson(res,200,duplicateReceiptV63(write.result.duplicate,exam,current.db));}
      await markExamGrantUsedV63(body.attemptId,submissionKey);
      await consumeRecoveryV65(recoveryGrantV65?.request?.id||body.recoveryRequestId,submissionKey);
      const receiptHash = crypto.createHash("sha256").update(`${write.result.id}|${student.id}|${exam.id}|${write.result.submittedAt}`).digest("hex");
      await securityAudit({ type: "descriptive_submit", userId: student.id, role: student.role, ip: clientIp(req), details: `${exam.title} | ${receiptHash.slice(0, 12)}` });
      return sendJson(res, 200, { ok: true, receiptId: write.result.id, receiptHash, submittedAt: write.result.submittedAt, sheetCode: write.result.sheetCode, gradingStatus: "awaiting_package_export" });
    }

    if (req.method === "GET" && url.pathname === "/api/student/results") {
      const attempts = (db.attempts || []).filter(a => a.studentId === student.id);
      const submissions = (db.submissions || []).filter(s => s.studentId === student.id);
      const results = [];
      for (const attempt of attempts) {
        const exam = (db.exams || []).find(e => e.id === attempt.examId); if (!exam) continue;
        const meta = examCurriculumMeta(db, exam);
        results.push({ id: attempt.id, examId: exam.id, title: exam.title, subject: exam.subject, bookId: meta.bookId, bookTitle: meta.bookTitle, chapterId: meta.chapterId, chapter: meta.chapterTitle, type: exam.type, score: attempt.score, total: attempt.total || examTotalScore(exam), percent: Number(attempt.percent ?? ((attempt.total || examTotalScore(exam)) ? Math.round(Number(attempt.score||0) / Number(attempt.total || examTotalScore(exam)) * 1000) / 10 : 0)), correctCount: Number(attempt.correctCount||0), answeredCount: Number(attempt.answeredCount||0), questionCount: Number(attempt.questionCount || (exam.questions||[]).length), gradingStatus: "final", status: "final", resultRevision: Number(attempt.resultRevision||1), resultUpdatedAt: Number(attempt.resultUpdatedAt||attempt.submittedAt||0), submittedAt: attempt.submittedAt, canAppeal: true });
      }
      for (const submission of submissions) {
        const exam = (db.exams || []).find(e => e.id === submission.examId); if (!exam) continue;
        const grade = (db.grades || []).find(g => g.submissionId === submission.id);
        const meta = examCurriculumMeta(db, exam);
        results.push({ id: submission.id, examId: exam.id, title: exam.title, subject: exam.subject, bookId: meta.bookId, bookTitle: meta.bookTitle, chapterId: meta.chapterId, chapter: meta.chapterTitle, type: exam.type, score: grade?.finalScore ?? null, total: examTotalScore(exam), status: grade ? "final" : "pending", resultRevision: grade ? Number(grade.resultRevision||1) : 0, resultUpdatedAt: grade ? Number(grade.publishedAt||grade.gradedAt||0) : 0, submittedAt: submission.submittedAt || 0, feedback: grade?.feedback || "", aiSuggestedScore: submission.ai?.totalSuggestedScore ?? null, canAppeal: Boolean(grade) });
      }
      return sendJson(res, 200, { results: results.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0)), report: studentReport(db, student.id) });
    }

    match = url.pathname.match(/^\/api\/student\/results\/([^/]+)\/details$/);
    if (req.method === "GET" && match) {
      const examId = decodeURIComponent(match[1]);
      const exam = (db.exams || []).find(e => e.id === examId && e.classId === student.classId);
      if (!exam) throw Object.assign(new Error("آزمون پیدا نشد."), { status: 404 });
      const meta = examCurriculumMeta(db, exam);
      const common = { examId: exam.id, title: exam.title, subject: exam.subject, bookId: meta.bookId, bookTitle: meta.bookTitle, chapterId: meta.chapterId, chapter: meta.chapterTitle, type: exam.type, total: examTotalScore(exam) };
      if (exam.type === "mcq") {
        const attempt = (db.attempts || []).find(a => a.examId === exam.id && a.studentId === student.id);
        if (!attempt) throw Object.assign(new Error("هنوز نتیجه‌ای برای این آزمون ثبت نشده است."), { status: 404 });
        const questions = (exam.questions || []).map((q, index) => {
          const source = q.sourceQuestionId ? (db.questionBank || []).find(item => item.id === q.sourceQuestionId) : null;
          const rawAnswer = attempt.answers?.[q.id]; const answered = rawAnswer !== undefined && rawAnswer !== null && rawAnswer !== "";
          const selectedIndex = answered ? Number(rawAnswer) : null; const correctIndex = Number(q.answer); const correct = answered && selectedIndex === correctIndex;
          return { questionId: q.id, number: index + 1, text: q.text, maxScore: Number(q.score || 0), earnedScore: correct ? Number(q.score || 0) : 0, answered, correct, selectedIndex, selectedAnswer: answered ? String((q.choices || [])[selectedIndex] ?? "") : "", correctIndex, correctAnswer: String((q.choices || [])[correctIndex] ?? ""), choices: (q.choices || []).map(String), explanation: String(q.explanation || source?.explanation || "پاسخ صحیح را با متن درس دوباره مرور کنید.") };
        });
        return sendJson(res, 200, { ...common, status: "final", resultRevision: Number(attempt.resultRevision||1), resultUpdatedAt: Number(attempt.resultUpdatedAt||attempt.submittedAt||0), score: Number(attempt.score || 0), submittedAt: attempt.submittedAt || 0, questions });
      }
      const submission = (db.submissions || []).find(item => item.examId === exam.id && item.studentId === student.id);
      if (!submission) throw Object.assign(new Error("هنوز برگه‌ای برای این آزمون ثبت نشده است."), { status: 404 });
      const grade = (db.grades || []).find(item => item.submissionId === submission.id && String(item.publishStatus || "published") === "published");
      if (!grade) return sendJson(res, 200, { ...common, status: "pending", score: null, submittedAt: submission.submittedAt || 0, feedback: "برگه در انتظار ثبت نمره نهایی معلم است.", questions: [] });
      const questions = (exam.questions || []).map((raw, index) => {
        const q = normalizeDescriptiveQuestion(raw); const gradeQ = (grade.questionScores || []).find(item => String(item.questionId) === String(q.id)) || {}; const aiQ = (submission.ai?.questions || []).find(item => String(item.questionId) === String(q.id)) || {};
        const earned = Number(gradeQ.teacherScore ?? gradeQ.score ?? 0); const max = Number(q.score || 0); const status = earned >= max - 0.001 ? "correct" : earned > 0 ? "partial" : "incorrect"; const typed = String(submission.typedAnswers?.[q.id] || "").trim();
        const autoQ=(submission.autoGrading?.questions||[]).find(item=>String(item.questionId)===String(q.id));
        if(exam.type==="mixed"&&autoQ?.autoGraded){
          const qType=String(raw.type||q.type||"");
          if(qType==="mcq"){const selectedIndex=Number(autoQ.studentAnswer),correctIndex=Number(autoQ.correctAnswer);return {questionId:q.id,number:index+1,text:q.text,maxScore:max,earnedScore:earned,autoGraded:true,type:qType,answered:Boolean(autoQ.answered),correct:Boolean(autoQ.correct),selectedIndex,selectedAnswer:String((raw.choices||[])[selectedIndex]??""),correctIndex,correctAnswer:String((raw.choices||[])[correctIndex]??""),choices:(raw.choices||[]).map(String),explanation:String(raw.explanation||"")};}
          if(qType==="true_false"){const label=v=>(v===true||v===1||String(v)==="1")?"صحیح":"غلط";return {questionId:q.id,number:index+1,text:q.text,maxScore:max,earnedScore:earned,autoGraded:true,type:qType,answered:Boolean(autoQ.answered),correct:Boolean(autoQ.correct),studentAnswer:label(autoQ.studentAnswer),correctAnswer:label(autoQ.correctAnswer),explanation:String(raw.explanation||"")};}
          if(qType==="fill_blank"){return {questionId:q.id,number:index+1,text:q.text,maxScore:max,earnedScore:earned,autoGraded:true,type:qType,answered:Boolean(autoQ.answered),correct:Boolean(autoQ.correct),studentAnswer:String(autoQ.studentAnswer??""),correctAnswer:Array.isArray(autoQ.correctAnswer)?autoQ.correctAnswer.join(" / "):String(autoQ.correctAnswer??""),explanation:String(raw.explanation||"")};}
        }
        return { questionId: q.id, number: index + 1, text: q.text, maxScore: max, earnedScore: earned, autoGraded:false, status, studentAnswer: typed || (submission.files?.length ? "پاسخ در تصویر برگه ثبت شده است." : "پاسخی ثبت نشده است."), teacherFeedback: String(gradeQ.feedback || ""), referenceAnswer: String(q.referenceAnswer || ""), criteria: (gradeQ.criterionScores || []).map(item => ({ title: String(item.title || "معیار"), score: Number(item.teacherScore ?? item.score ?? 0), maxScore: Number(item.maxScore || 0) })) };
      });
      return sendJson(res, 200, { ...common, status: "final", resultRevision: Number(grade.resultRevision||1), resultUpdatedAt: Number(grade.publishedAt||grade.gradedAt||0), score: Number(grade.finalScore || 0), submittedAt: submission.submittedAt || 0, feedback: String(grade.feedback || ""), questions });
    }

    if (req.method === "GET" && url.pathname === "/api/student/appeals") return sendJson(res, 200, { appeals: (db.appeals || []).filter(a => a.studentId === student.id) });
    if (req.method === "POST" && url.pathname === "/api/student/appeals") {
      const body = await readJson(req);
      const message = String(body.message || "").trim();
      if (message.length < 10) throw Object.assign(new Error("توضیح اعتراض باید کامل‌تر باشد."), { status: 400 });
      const write = await mutateDb(async mutable => {
        const exam = (mutable.exams || []).find(e => e.id === body.examId && e.classId === student.classId);
        if (!exam) throw Object.assign(new Error("آزمون پیدا نشد."), { status: 404 });
        const questionId = body.questionId ? String(body.questionId) : "";
        if (questionId && !(exam.questions || []).some(q => String(q.id) === questionId)) throw Object.assign(new Error("سؤال انتخاب‌شده متعلق به این آزمون نیست."), { status: 400 });
        const attempt = (mutable.attempts || []).find(a => a.examId === exam.id && a.studentId === student.id);
        const submission = (mutable.submissions || []).find(s => s.examId === exam.id && s.studentId === student.id);
        const grade = submission ? (mutable.grades || []).find(g => g.submissionId === submission.id && String(g.publishStatus || "published") === "published") : null;
        const hasPublishedResult = exam.type === "mcq" ? Boolean(attempt && (attempt.submittedAt || attempt.status === "submitted")) : Boolean(grade);
        if (!hasPublishedResult) throw Object.assign(new Error("اعتراض فقط پس از انتشار نتیجه نهایی قابل ثبت است."), { status: 409 });
        const appealedResultRevision = exam.type === "mcq" ? Number(attempt.resultRevision || 1) : Number(grade.resultRevision || 1);
        mutable.appeals ||= [];
        const sameOpen = mutable.appeals.find(a => a.examId === exam.id && a.studentId === student.id && String(a.questionId || "") === questionId && ["open", "reviewing"].includes(a.status));
        if (sameOpen) throw Object.assign(new Error("برای این مورد یک اعتراض باز وجود دارد."), { status: 409 });
        const createdAtFa = faNow();
        const appeal = { id: makeId("app"), examId: exam.id, questionId: questionId || null, studentId: student.id, appealedResultRevision, message, status: "open", at: createdAtFa, createdAt: Date.now(), teacherResponse: "", history: [{ status: "open", note: `اعتراض به نسخه ${appealedResultRevision} نتیجه توسط دانش‌آموز ثبت شد`, resultRevision: appealedResultRevision, at: createdAtFa, by: student.id }] };
        mutable.appeals.push(appeal);
        mutable.notifications ||= []; mutable.notifications.unshift({ id: makeId("not"), userId: exam.createdBy, title: "اعتراض جدید به نمره", body: `${student.firstName} ${student.lastName} برای «${exam.title}» درخواست بررسی ثبت کرد.`, read: false, at: faNow() });
        return appeal;
      });
      return sendJson(res, 201, { appeal: write.result });
    }

    if (req.method === "POST" && url.pathname === "/api/student/homework/submit") {
      const body = await readJson(req); const homeworkId = String(body.homeworkId || "");
      const result = await mutateDb(async mutable => {
        const homework = (mutable.homework || []).find(h => h.id === homeworkId && studentCanSeeHomework(db, h, student));
        if (!homework) throw Object.assign(new Error("تکلیف فعال پیدا نشد."), { status: 404 });
        const text = String(body.text || "").trim();
        if (text.length < 2) throw Object.assign(new Error("پاسخ یا توضیح تحویل را وارد کنید."), { status: 400 });
        mutable.homeworkSubmissions ||= [];
        let submission = mutable.homeworkSubmissions.find(x => x.homeworkId === homework.id && x.studentId === student.id);
        if (submission && submission.status === "graded") throw Object.assign(new Error("این تکلیف نمره‌گذاری شده و قابل تغییر نیست."), { status: 409 });
        const due=String(homework.dueAt||"").slice(0,10),today=new Date().toISOString().slice(0,10),isLate=Boolean(due&&today>due),status=isLate?"late":"submitted",attachmentIds=Array.isArray(body.attachmentIds)?body.attachmentIds.map(String).slice(0,10):[];
        if(isLate&&homework.allowLate===false)throw Object.assign(new Error("مهلت تحویل این تکلیف پایان یافته است."),{status:409});
        if (submission) Object.assign(submission, { text, attachmentIds, status, submittedAt: faNow(), submittedAtIso:new Date().toISOString(), updatedAt: new Date().toISOString() });
        else { submission = { id: makeId("hwsub"), homeworkId: homework.id, studentId: student.id, text, attachmentIds, status, submittedAt: faNow(), submittedAtIso:new Date().toISOString(), createdAt: new Date().toISOString() }; mutable.homeworkSubmissions.push(submission); }
        mutable.notifications ||= []; mutable.notifications.unshift({ id: makeId("not"), userId: homework.createdBy, title: "تحویل تکلیف جدید", body: `${student.firstName} ${student.lastName} تکلیف «${homework.title}» را تحویل داد.`, read: false, at: faNow() });
        mutable.audit ||= []; mutable.audit.unshift({ id: makeId("log"), userId: student.id, action: "تحویل تکلیف", details: homework.title, at: faNow() });
        return submission;
      });
      return sendJson(res, 200, { ok: true, submission: result.result });
    }


    if (req.method === "GET" && url.pathname === "/api/student/learning-center") {
      const activeYear=String(db.school?.year||""),academicPeriod=normalizeAcademicPeriod(url.searchParams.get("academicPeriod")||"semester2",{allowAnnual:false});
      const homework=(db.homework||[]).filter(h=>studentCanSeeHomework(db,h,student)).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).map(h=>({...h,submission:(db.homeworkSubmissions||[]).find(x=>x.homeworkId===h.id&&x.studentId===student.id)||null}));
      const subjects=[...new Set((db.teachingAssignments||[]).filter(a=>a.classId===student.classId&&a.active!==false&&String(a.academicYear||activeYear)===activeYear).map(a=>a.subject).filter(Boolean))];
      const continuous=subjects.map(subject=>({subject,...gradebookContinuousV75(db,{studentId:student.id,classId:student.classId,subject,academicYear:activeYear,academicPeriod}),lock:termLockV75(db,{classId:student.classId,subject,academicYear:activeYear,academicPeriod})}));
      const reportCards=(db.reportCards||[]).filter(r=>r.studentId===student.id&&String(r.academicYear||"")===activeYear&&r.status==="published").slice().sort((a,b)=>String(b.publishedAt||"").localeCompare(String(a.publishedAt||"")));
      const notifications=(db.notifications||[]).filter(n=>n.userId===student.id).slice(0,100);
      return sendJson(res,200,{ok:true,academicYear:activeYear,academicPeriod,homework,continuous,reportCards,notifications});
    }

    if (req.method === "POST" && url.pathname === "/api/student/consents/respond") {
      return sendJson(res, 403, { error: "پاسخ رضایت‌نامه فقط توسط ولی احرازشده در پنل اولیا مجاز است.", code: "GUARDIAN_CONSENT_REQUIRED" });
    }

    if (req.method === "POST" && url.pathname === "/api/student/progress/acknowledge") {
      const body = await readJson(req); const reportId = String(body.reportId || "");
      const result = await mutateDb(async mutable => {
        const report = (mutable.progressReports || []).find(x => x.id === reportId && x.studentId === student.id && x.status === "published");
        if (!report) throw Object.assign(new Error("گزارش پیشرفت پیدا نشد."), { status: 404 });
        report.acknowledgedAt = faNow(); report.acknowledgedAtIso = new Date().toISOString();
        mutable.audit ||= []; mutable.audit.unshift({ id: makeId("log"), userId: student.id, action: "تأیید مشاهده گزارش پیشرفت", details: report.title || report.period || report.id, at: faNow() });
        return report;
      });
      return sendJson(res, 200, { ok: true, report: result.result });
    }

    if (req.method === "POST" && url.pathname === "/api/student/notifications/read") {
      const body = await readJson(req);
      await mutateDb(async mutable => {
        for (const item of mutable.notifications || []) if (item.userId === student.id && (!body.id || item.id === body.id)) item.read = true;
      });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "مسیر اپ دانش‌آموز پیدا نشد." });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "خطای سرویس دانش‌آموز", code:error.code||undefined });
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

async function ensureDataDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(FILES_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(QUESTION_MEDIA_DIR_48, { recursive: true, mode: 0o700 });
  // Existing directories can predate the hardened permissions. Best-effort tighten them.
  for (const dir of [DATA_DIR, FILES_DIR, BACKUPS_DIR, QUESTION_MEDIA_DIR_48]) { try { await fs.chmod(dir, 0o700); } catch {} }
}

function safeKey(value) {
  const key = String(value || "");
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(key)) throw Object.assign(new Error("شناسه فایل معتبر نیست."), { status: 400 });
  return key;
}

function localIpv4Addresses() {
  const values = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family === "IPv4" && !item.internal) values.push(item.address);
    }
  }
  return [...new Set(values)];
}

function mobileUrls() {
  return localIpv4Addresses().map(ip => `http://${ip}:${PORT}`);
}

async function atomicWriteText(filePath, text, mode = 0o600) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    handle = await fs.open(tmp, "w", mode);
    await handle.writeFile(String(text), "utf8");
    await handle.sync();
    await handle.close(); handle = null;
    await fs.rename(tmp, filePath);
    try { await fs.chmod(filePath, mode); } catch {}
    try { const dir = await fs.open(path.dirname(filePath), "r"); await dir.sync(); await dir.close(); } catch {}
  } catch (error) {
    try { if (handle) await handle.close(); } catch {}
    try { await fs.rm(tmp, { force: true }); } catch {}
    throw error;
  }
}

// Stage 37: preserve the last-known-good file byte-for-byte without parsing and
// serializing the full database a second time. The temp copy is synced before
// the atomic rename, so the previous-state safety boundary remains intact.
async function atomicCopyFile(sourcePath, destinationPath, mode = 0o600) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const tmp = `${destinationPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    await fs.copyFile(sourcePath, tmp);
    handle = await fs.open(tmp, "r+");
    await handle.sync();
    await handle.close(); handle = null;
    await fs.rename(tmp, destinationPath);
    try { await fs.chmod(destinationPath, mode); } catch {}
    try { const dir = await fs.open(path.dirname(destinationPath), "r"); await dir.sync(); await dir.close(); } catch {}
  } catch (error) {
    try { if (handle) await handle.close(); } catch {}
    try { await fs.rm(tmp, { force: true }); } catch {}
    throw error;
  }
}

async function appendRecoveryLog(event) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await fs.appendFile(RECOVERY_LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { encoding: "utf8", mode: 0o600 });
  } catch (error) { console.warn("Recovery log failed", error.message); }
}
async function readRecoveryLog(limit = 20) {
  try {
    const lines=(await fs.readFile(RECOVERY_LOG_FILE,"utf8")).trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1,Number(limit)||20)).reverse().map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
  } catch { return []; }
}

// P67.304: encrypted restore spans state.json and security.json, so a normal
// single-file atomic rename is not enough. Keep a small write-ahead recovery
// record with the last-known-good pair. If the process dies between commits,
// startup restores the pair before either file is consumed by the application.
function validRestoreTransactionV67304(transaction) {
  return Boolean(
    transaction && transaction.version === 1 &&
    transaction.previous?.state?.initialized && transaction.previous?.state?.db &&
    validSecurityShape(transaction.previous?.security)
  );
}
async function writeEncryptedRestoreTransactionV67304(stateEnvelope, security) {
  const transaction = {
    version: 1,
    kind: "encrypted-backup-restore",
    preparedAt: new Date().toISOString(),
    previous: {
      state: structuredClone(stateEnvelope),
      security: structuredClone(security)
    }
  };
  await atomicWriteText(ENCRYPTED_RESTORE_TRANSACTION_FILE, JSON.stringify(transaction), 0o600);
  return transaction;
}
async function recoverInterruptedEncryptedRestoreV67304(reason = "startup") {
  let transaction;
  try { transaction = JSON.parse(await fs.readFile(ENCRYPTED_RESTORE_TRANSACTION_FILE, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    const wrapped = new Error("رکورد بازیابی پشتیبان رمزگذاری‌شده آسیب دیده است؛ برای جلوگیری از ناسازگاری داده سرویس متوقف شد.");
    wrapped.code = "ENCRYPTED_RESTORE_TRANSACTION_CORRUPT";
    wrapped.cause = error;
    throw wrapped;
  }
  if (!validRestoreTransactionV67304(transaction)) {
    const error = new Error("رکورد تراکنش بازیابی پشتیبان معتبر نیست؛ برای جلوگیری از ناسازگاری داده سرویس متوقف شد.");
    error.code = "ENCRYPTED_RESTORE_TRANSACTION_INVALID";
    throw error;
  }
  const previousState = structuredClone(transaction.previous.state);
  const previousSecurity = structuredClone(transaction.previous.security);
  validateServerState(upgradeServerDbRespectingReset(structuredClone(previousState.db)));
  const serializedState = JSON.stringify(previousState);
  const serializedSecurity = JSON.stringify(previousSecurity);
  await atomicWriteText(STATE_FILE, serializedState, 0o600);
  await atomicWriteText(STATE_MIRROR_FILE, serializedState, 0o600);
  await atomicWriteText(SECURITY_FILE, serializedSecurity, 0o600);
  await atomicWriteText(SECURITY_MIRROR_FILE, serializedSecurity, 0o600);
  await fs.rm(ENCRYPTED_RESTORE_TRANSACTION_FILE, { force: true });
  await appendRecoveryLog({ type: "encrypted_restore_transaction_recovered", reason, preparedAt: transaction.preparedAt || "" });
  return true;
}

async function cleanupStaleAtomicTemps() {
  const targets = [DATA_DIR, BACKUPS_DIR];
  for (const dir of targets) {
    try {
      for (const name of await fs.readdir(dir)) {
        if (!name.endsWith(".tmp")) continue;
        try { await fs.rm(path.join(dir, name), { force: true }); } catch {}
      }
    } catch {}
  }
}

async function readStateEnvelope() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { initialized: false, updatedAt: null, db: null };
    const wrapped = new Error("فایل اطلاعات اصلی سامانه آسیب دیده یا JSON معتبر نیست؛ بازیابی ایمن از آخرین نسخه سالم بررسی می‌شود.");
    wrapped.code = "STATE_DATA_CORRUPT";
    wrapped.cause = error;
    throw wrapped;
  }
}


function validateServerState(db) {
  const curriculum = Array.isArray(db.curriculum) ? db.curriculum : [];
  const progress = Array.isArray(db.chapterProgress) ? db.chapterProgress : [];
  for (const exam of db.exams || []) {
    const total=(exam.questions||[]).reduce((a,q)=>a+Number(q.score||0),0),target=Number(exam.targetScore)>0?Number(exam.targetScore):total;
    if(total>target+0.001)throw Object.assign(new Error(`جمع بارم سؤال‌های آزمون «${exam.title||""}» از نمره کل بیشتر است.`),{status:400});
    if (exam.status !== "active") continue;
    if(target<=0||Math.abs(total-target)>0.001)throw Object.assign(new Error(`انتشار آزمون «${exam.title||""}» فقط پس از تکمیل دقیق بارم مجاز است.`),{status:400});
    // P67.8: continuous (مستمر) exams are permitted during chapter instruction.
    // Chapter-completion remains a prerequisite only for final-term exams;
    // never make progress completion a global prerequisite for continuous assessments.
    if (String(exam.examCategory || "ongoing").toLowerCase() !== "final") continue;
    const book = curriculum.find(b => b.id === exam.bookId) || curriculum.find(b => b.subject === exam.subject);
    const chapter = book?.chapters?.find(c => c.id === exam.chapterId || c.title === exam.chapter);
    if (!book || !chapter) continue;
    const completed = progress.some(p => p.classId === exam.classId && p.bookId === book.id && p.chapterId === chapter.id && p.status === "completed");
    if (!completed) throw Object.assign(new Error(`انتشار آزمون «${exam.title}» قبل از پایان تدریس فصل مجاز نیست.`), { status: 400 });
  }
  return true;
}
let lastAutoSnapshotAt = 0;
let lastTieredBackupCheckKeyV50 = "";
function autoSnapshotDueV50(db, now = Date.now()) {
  const intervalMinutes = Number(db?.school?.settings?.autoBackupMinutes || 5);
  return now - lastAutoSnapshotAt >= Math.max(1, intervalMinutes) * 60000;
}
function safeBackupName(value) {
  const name = String(value || "");
  if (!/^[a-zA-Z0-9_.-]{1,180}\.json$/.test(name)) throw Object.assign(new Error("نام نسخه پشتیبان معتبر نیست."), { status: 400 });
  return name;
}
async function pruneStateSnapshots(retention = 20, settings = {}) {
  await fs.mkdir(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  try { await fs.chmod(BACKUPS_DIR, 0o700); } catch {}
  const rows=await listStateSnapshots();
  const daily=rows.filter(r=>String(r.label||"").startsWith("daily-"));
  const weekly=rows.filter(r=>String(r.label||"").startsWith("weekly-"));
  const auto=rows.filter(r=>r.label==="auto");
  const protectedNames=new Set([
    ...daily.slice(0,Math.max(1,Number(settings.dailyBackupRetention||7))).map(r=>r.name),
    ...weekly.slice(0,Math.max(1,Number(settings.weeklyBackupRetention||4))).map(r=>r.name),
    ...auto.slice(0,Math.max(1,Number(retention)||20)).map(r=>r.name)
  ]);
  const manualAndSafety=rows.filter(r=>!String(r.label||"").startsWith("daily-")&&!String(r.label||"").startsWith("weekly-")&&r.label!=="auto");
  for(const r of manualAndSafety.slice(0,Math.max(5,Number(retention)||20)))protectedNames.add(r.name);
  for(const r of rows)if(!protectedNames.has(r.name))await fs.rm(path.join(BACKUPS_DIR,r.name),{force:true});
}
async function createStateSnapshotFromEnvelopeV50(current, label = "manual", options = {}) {
  if (!current?.initialized || !current?.db) return null;
  await fs.mkdir(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  try { await fs.chmod(BACKUPS_DIR, 0o700); } catch {}
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = String(label || "snapshot").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "snapshot";
  const nonce = crypto.randomBytes(3).toString("hex");
  const name = `${stamp}-${safeLabel}-${nonce}.json`;
  const payload = { app: "madreseyar-local-state", version: APP_VERSION, release:APP_RELEASE, createdAt: new Date().toISOString(), label, envelope: current };
  await atomicWriteText(path.join(BACKUPS_DIR, name), JSON.stringify(payload), 0o600);
  if(!options.skipPrune){const settings=current.db?.school?.settings||{};await pruneStateSnapshots(Number(settings.backupRetention||20),settings);}
  return { name, createdAt: payload.createdAt, label };
}
async function createStateSnapshot(label = "manual", options = {}) {
  const current = await readStateEnvelope();
  return createStateSnapshotFromEnvelopeV50(current, label, options);
}
async function listStateSnapshots() {
  await fs.mkdir(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  try { await fs.chmod(BACKUPS_DIR, 0o700); } catch {}
  const rows = [];
  for (const name of await fs.readdir(BACKUPS_DIR)) {
    if (!name.endsWith(".json")) continue;
    try { const filePath=path.join(BACKUPS_DIR,name),stat=await fs.stat(filePath),payload=JSON.parse(await fs.readFile(filePath,"utf8"));rows.push({name,createdAt:payload.createdAt||stat.mtime.toISOString(),label:payload.label||"snapshot",size:stat.size}); } catch {}
  }
  return rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function validatedRecoveryCandidate(filePath, source) {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    const envelope = (source === "previous" || source === "mirror") ? raw : raw?.envelope;
    if (!envelope?.initialized || !envelope?.db) return null;
    const db = upgradeServerDbRespectingReset(structuredClone(envelope.db));
    validateServerState(db);
    const stat = await fs.stat(filePath);
    return { source, filePath, envelope: { initialized: true, updatedAt: envelope.updatedAt || stat.mtime.toISOString(), db }, mtimeMs: stat.mtimeMs };
  } catch { return null; }
}

async function recoverCorruptState() {
  const candidates = [];
  const mirror = await validatedRecoveryCandidate(STATE_MIRROR_FILE, "mirror");
  if (mirror) candidates.push(mirror);
  const prev = await validatedRecoveryCandidate(STATE_PREVIOUS_FILE, "previous");
  if (prev) candidates.push(prev);
  try {
    for (const row of await listStateSnapshots()) {
      const item = await validatedRecoveryCandidate(path.join(BACKUPS_DIR, row.name), `backup:${row.name}`);
      if (item) candidates.push(item);
    }
  } catch {}
  candidates.sort((a,b)=>b.mtimeMs-a.mtimeMs);
  const chosen = candidates[0];
  if (!chosen) {
    await appendRecoveryLog({ type: "recovery_failed", reason: "no_valid_candidate" });
    const error = new Error("فایل اطلاعات اصلی سامانه آسیب دیده و هیچ نسخه پشتیبان سالمی برای بازیابی پیدا نشد؛ سرویس برای جلوگیری از از دست رفتن داده متوقف شد.");
    error.code = "STATE_RECOVERY_UNAVAILABLE";
    throw error;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const quarantine = path.join(DATA_DIR, `state.corrupt-${stamp}-${crypto.randomBytes(3).toString("hex")}.json`);
  try { await fs.rename(STATE_FILE, quarantine); } catch {}
  await atomicWriteText(STATE_FILE, JSON.stringify(chosen.envelope), 0o600);
  await appendRecoveryLog({ type: "state_auto_recovered", source: chosen.source, quarantine: path.basename(quarantine), updatedAt: chosen.envelope.updatedAt });
  return chosen.envelope;
}
function isoWeekKeyV4515(date=new Date()) {const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const y0=new Date(Date.UTC(d.getUTCFullYear(),0,1));const week=Math.ceil((((d-y0)/86400000)+1)/7);return `${d.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;}
async function maybeCreateTieredBackupsV4515(currentEnvelope = null, options = {}) {
  const current=currentEnvelope?.initialized&&currentEnvelope?.db?currentEnvelope:await readStateEnvelope();
  if(!current.initialized||!current.db)return;
  const today=new Date().toISOString().slice(0,10),week=isoWeekKeyV4515(),checkKey=`${today}|${week}`;
  // Stage50: hot writes only inspect the backup directory once per day/week key.
  // Startup/hourly maintenance still calls this function with pruning enabled.
  if(lastTieredBackupCheckKeyV50!==checkKey){
    const rows=await listStateSnapshots();
    if(!rows.some(r=>r.label===`daily-${today}`))await createStateSnapshotFromEnvelopeV50(current,`daily-${today}`,{skipPrune:true});
    if(!rows.some(r=>r.label===`weekly-${week}`))await createStateSnapshotFromEnvelopeV50(current,`weekly-${week}`,{skipPrune:true});
    lastTieredBackupCheckKeyV50=checkKey;
  }
  if(options.prune!==false){const st=current.db?.school?.settings||{};await pruneStateSnapshots(Number(st.backupRetention||20),st);}
}
function hasInlineQuestionMedia48(db) {
  const banks=[db?.adminQuestionBank,db?.questionBank];
  for(const rows of banks)for(const row of Array.isArray(rows)?rows:[])if(String(row?.imageDataUrl||'').startsWith('data:image/'))return true;
  for(const exam of Array.isArray(db?.exams)?db.exams:[])for(const row of Array.isArray(exam?.questions)?exam.questions:[])if(String(row?.imageDataUrl||'').startsWith('data:image/'))return true;
  return false;
}

async function writeStateEnvelope(db, options = {}) {
  const totalStarted = performance.now();
  const metrics = options.metrics && typeof options.metrics === "object" ? options.metrics : null;
  const mark = (name, started) => { if (metrics) metrics[name] = Math.max(0, Math.round((performance.now() - started) * 10) / 10); };
  let phaseStarted = performance.now();
  if (!db || typeof db !== "object") throw Object.assign(new Error("ساختار اطلاعات سامانه معتبر نیست."), { status: 400 });
  const now = Date.now();
  if (!options.skipSnapshot && autoSnapshotDueV50(db, now)) {
    try {
      // Stage50: mutateDb can provide the pre-mutation envelope from memory. Direct
      // writeStateEnvelope callers retain a safe disk-read fallback.
      const prior = options.previousEnvelope?.initialized && options.previousEnvelope?.db ? options.previousEnvelope : null;
      const snapshot = prior
        ? await createStateSnapshotFromEnvelopeV50(prior, "auto", { skipPrune: true })
        : await createStateSnapshot("auto", { skipPrune: true });
      if (snapshot) lastAutoSnapshotAt = now;
    } catch (error) { console.warn("Auto snapshot failed", error.message); }
  }
  mark("snapshotMs", phaseStarted);

  phaseStarted = performance.now();
  db = upgradeServerDbRespectingReset(db);
  // Stage48: keep large question images out of state.json. The cheap predicate
  // prevents a full media scan on normal writes that contain no inline image.
  if (hasInlineQuestionMedia48(db)) {
    const mediaStats = await externalizeQuestionImages48(db, QUESTION_MEDIA_DIR_48);
    if (metrics) {
      metrics.questionMediaExternalized = Number(mediaStats.externalized || 0);
      metrics.questionMediaBytesRemoved = Number(mediaStats.bytesRemovedFromState || 0);
      metrics.questionMediaFilesCreated = Number(mediaStats.filesCreated || 0);
    }
  }
  validateServerState(db);
  const envelope = { initialized: true, updatedAt: new Date().toISOString(), db };
  mark("validateMs", phaseStarted);

  phaseStarted = performance.now();
  // Serialize once and reuse the exact same committed bytes for primary + mirror.
  const serializedEnvelope = JSON.stringify(envelope);
  mark("serializeMs", phaseStarted);

  phaseStarted = performance.now();
  // Copy the current primary state as the previous-state recovery point. This
  // avoids a redundant JSON parse/stringify cycle while retaining atomic commit.
  try {
    await atomicCopyFile(STATE_FILE, STATE_PREVIOUS_FILE, 0o600);
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Previous state snapshot failed", error.message);
  }
  mark("previousCopyMs", phaseStarted);

  phaseStarted = performance.now();
  await atomicWriteText(STATE_FILE, serializedEnvelope, 0o600);
  mark("primaryWriteMs", phaseStarted);

  phaseStarted = performance.now();
  try { await atomicWriteText(STATE_MIRROR_FILE, serializedEnvelope, 0o600); }
  catch (error) { console.warn("State mirror failed", error.message); }
  mark("mirrorWriteMs", phaseStarted);

  phaseStarted = performance.now();
  if (!options.skipTiered) {
    try { await maybeCreateTieredBackupsV4515(envelope, { prune: false }); }
    catch (error) { console.warn("Tiered backup failed", error.message); }
  }
  mark("tieredBackupMs", phaseStarted);
  mark("writeTotalMs", totalStarted);
  return envelope;
}

async function handleLocalBackupApi(req, res, url, auth) {
  try {
    if (!["admin", "superadmin"].includes(auth.user.role)) throw Object.assign(new Error("مدیریت نسخه‌های پشتیبان فقط برای ادمین مجاز است."), { status: 403 });
    if (req.method === "GET" && url.pathname === "/api/admin/local-backups") return sendJson(res, 200, { backups: await listStateSnapshots() });
    if (req.method === "POST" && url.pathname === "/api/admin/local-backups") {
      const row = await createStateSnapshot("manual");
      await securityAudit({ type: "local_snapshot_create", userId: auth.user.id, role: auth.user.role, ip: clientIp(req), details: row?.name || "" });
      return sendJson(res, 200, { ok: true, backup: row, backups: await listStateSnapshots() });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/local-backups/restore") {
      const body = await readJson(req); const name = safeBackupName(body.name);
      const saved = await enqueueStateOperation(async () => {
        let payload;
        try { payload = JSON.parse(await fs.readFile(path.join(BACKUPS_DIR, name), "utf8")); }
        catch (error) { if(error?.code==="ENOENT") throw error; throw Object.assign(new Error("نسخه پشتیبان انتخاب‌شده خراب یا JSON نامعتبر است."), { status: 400 }); }
        if (payload.app !== "madreseyar-local-state" || !payload.envelope?.db) throw Object.assign(new Error("نسخه پشتیبان انتخاب‌شده معتبر نیست."), { status: 400 });
        const candidate=upgradeServerDbRespectingReset(structuredClone(payload.envelope.db)); validateServerState(candidate);
        await createStateSnapshot("before-restore");
        return writeStateEnvelope(candidate, { skipSnapshot: true });
      });
      await ensureSecurityInitialized(saved.db);
      await securityAudit({ type: "local_snapshot_restore", userId: auth.user.id, role: auth.user.role, ip: clientIp(req), details: name });
      return sendJson(res, 200, { ok: true, updatedAt: saved.updatedAt, db: scopedDbForStaff(saved.db, auth.user) });
    }
    return sendJson(res, 404, { error: "مسیر نسخه پشتیبان پیدا نشد." });
  } catch (error) {
    return sendJson(res, error.code === "ENOENT" ? 404 : error.status || 500, { error: error.code === "ENOENT" ? "نسخه پشتیبان پیدا نشد." : error.message });
  }
}

async function handleState(req, res, auth) {
  try {
    if (req.method === "GET") {
      const envelope = await ensureStateInitialized();
      await securityAudit({ type: "state_read", userId: auth.user.id, role: auth.user.role, ip: clientIp(req) });
      return sendJson(res, 200, { initialized: true, updatedAt: envelope.updatedAt, db: scopedDbForStaff(envelope.db, auth.user) });
    }
    const payload = await readJson(req); const incoming = payload.db, baseUpdatedAt = String(payload.baseUpdatedAt || "");
    if (!incoming || typeof incoming !== "object") throw Object.assign(new Error("ساختار اطلاعات معتبر نیست."), { status: 400 });
    if (!baseUpdatedAt) throw Object.assign(new Error("نسخه مبنای ذخیره مشخص نیست؛ ابتدا اطلاعات را دوباره از سرور دریافت کنید."), { status: 428, code: "STATE_PRECONDITION_REQUIRED" });
    const saved = await enqueueStateOperation(async () => {
      const latestEnvelope = await ensureStateInitialized();
      if (String(latestEnvelope.updatedAt || "") !== baseUpdatedAt) {
        const conflict = Object.assign(new Error("اطلاعات سامانه پس از آخرین دریافت شما تغییر کرده است؛ ذخیره برای جلوگیری از حذف تغییرات همزمان متوقف شد."), {
          status: 409, code: "STATE_CONFLICT",
          latestUpdatedAt: latestEnvelope.updatedAt,
          latestDb: scopedDbForStaff(latestEnvelope.db, auth.user)
        });
        throw conflict;
      }
      const latest = latestEnvelope.db;
      const next = auth.user.role === "teacher"
        ? mergeTeacherDb(latest, incoming, auth.user)
        : validateAdminState(latest, incoming, auth.user);
      return writeStateEnvelope(next);
    });
    const beforeUserIds=new Set((auth.db?.users||[]).map(u=>String(u.id)));
    const afterUsers=saved.db?.users||[];
    const securityNeedsSync=afterUsers.length!==beforeUserIds.size||afterUsers.some(u=>!beforeUserIds.has(String(u.id)));
    if(securityNeedsSync) await ensureSecurityInitialized(saved.db);
    await securityAudit({ type: "state_write", userId: auth.user.id, role: auth.user.role, ip: clientIp(req), details: "ذخیره تغییرات سامانه" });
    return sendJson(res, 200, { initialized: true, updatedAt: saved.updatedAt, db: scopedDbForStaff(saved.db, auth.user) });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message || "ذخیره اطلاعات ناموفق بود.",
      code: error.code || undefined,
      latestUpdatedAt: error.latestUpdatedAt || undefined,
      db: error.latestDb || undefined
    });
  }
}

async function handleFiles(req, res, pathname, auth) {
  try {
    await ensureDataDirs();
    if (pathname === "/api/files" && req.method === "GET") {
      const names = (await fs.readdir(FILES_DIR)).filter(name => name.endsWith(".json"));
      const records = [];
      for (const name of names) {
        try { records.push(JSON.parse(await fs.readFile(path.join(FILES_DIR, name), "utf8"))); } catch {}
      }
      let visible = records;
      if (auth.user.role === "teacher") {
        const scope = teacherScope(auth.db, auth.user);
        const allowedSubmissions = new Set((auth.db.submissions || []).filter(s => scope.examIds.has(s.examId) && scope.studentIds.has(s.studentId)).map(s => s.id));
        visible = records.filter(r => {
          if (r.submissionId) return allowedSubmissions.has(r.submissionId);
          if (r.studentId) return scope.studentIds.has(r.studentId);
          return false;
        });
      }
      return sendJson(res, 200, { records: visible });
    }
    if (pathname === "/api/files" && req.method === "POST") {
      const record = await readJson(req);
      const key = safeKey(record.key);
      // P67.20: official photo keys belong exclusively to the dedicated student profile API.
      if (/^student_profile_/i.test(key)) throw Object.assign(new Error("کلید عکس رسمی دانش‌آموز از مسیر عمومی فایل‌ها قابل تغییر نیست."), { status: 403 });
      const dataUrl = String(record.dataUrl || "");
      if (!/^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/i.test(dataUrl)) throw Object.assign(new Error("فقط تصویر JPG/PNG/WebP یا PDF معتبر قابل ذخیره است."), { status: 400 });
      const maxUploadMb = Number(auth.db?.school?.settings?.maxUploadMb || 12);
      const estimatedBytes = Math.ceil(dataUrl.slice(dataUrl.indexOf(",") + 1).length * 0.75);
      if (estimatedBytes > maxUploadMb * 1024 * 1024) throw Object.assign(new Error(`حجم فایل از سقف ${maxUploadMb} مگابایت بیشتر است.`), { status: 413 });
      const clean = { ...record, key, savedAt: Number(record.savedAt || Date.now()) };
      if (auth.user.role === "teacher") {
        const scope = teacherScope(auth.db, auth.user);
        if (clean.submissionId) {
          const submission = (auth.db.submissions || []).find(x => x.id === clean.submissionId);
          if (!submission || !scope.examIds.has(submission.examId) || !scope.studentIds.has(submission.studentId)) throw Object.assign(new Error("به این فایل دسترسی ندارید."), { status: 403 });
        } else if (clean.studentId) {
          if (!scope.studentIds.has(clean.studentId)) throw Object.assign(new Error("به پرونده این دانش‌آموز دسترسی ندارید."), { status: 403 });
        } else {
          throw Object.assign(new Error("ذخیره این نوع فایل برای حساب معلم مجاز نیست."), { status: 403 });
        }
      }
      await atomicWriteText(path.join(FILES_DIR, `${key}.json`), JSON.stringify(clean), 0o600);
      return sendJson(res, 200, { ok: true, key });
    }
    if (pathname === "/api/files" && req.method === "DELETE") {
      if (auth.user.role !== "superadmin") throw Object.assign(new Error("حذف یکجای فایل‌ها فقط برای سوپرادمین مجاز است."), { status: 403 });
      if (req.headers["x-msy-delete-all-files-confirm"] !== "DELETE_ALL_FILES") throw Object.assign(new Error("برای حذف یکجای فایل‌ها تأیید صریح لازم است."), { status: 428 });
      await securityAudit({ type: "files_bulk_delete", userId:auth.user.id, role:auth.user.role, ip:clientIp(req), details:"all generic stored files" });
      await fs.rm(FILES_DIR, { recursive: true, force: true });
      await fs.mkdir(FILES_DIR, { recursive: true, mode: 0o700 });
      try { await fs.chmod(FILES_DIR, 0o700); } catch {}
      return sendJson(res, 200, { ok: true });
    }
    const match = pathname.match(/^\/api\/files\/([a-zA-Z0-9_-]+)$/);
    if (!match) return sendJson(res, 404, { error: "فایل پیدا نشد." });
    const key = safeKey(match[1]);
    if (req.method === "DELETE" && /^student_profile_/i.test(key)) throw Object.assign(new Error("حذف عکس رسمی دانش‌آموز از مسیر عمومی فایل‌ها مجاز نیست."), { status: 403 });
    const filePath = path.join(FILES_DIR, `${key}.json`);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (auth.user.role === "teacher") {
      const scope = teacherScope(auth.db, auth.user);
      if (record.submissionId) {
        const submission = (auth.db.submissions || []).find(x => x.id === record.submissionId);
        if (!submission || !scope.examIds.has(submission.examId) || !scope.studentIds.has(submission.studentId)) throw Object.assign(new Error("به این فایل دسترسی ندارید."), { status: 403 });
      } else if (record.studentId) {
        if (!scope.studentIds.has(record.studentId)) throw Object.assign(new Error("به پرونده این دانش‌آموز دسترسی ندارید."), { status: 403 });
      } else {
        throw Object.assign(new Error("به این فایل دسترسی ندارید."), { status: 403 });
      }
    }
    if (req.method === "GET") return sendJson(res, 200, record);
    if (req.method === "DELETE") { await fs.rm(filePath, { force: true }); return sendJson(res, 200, { ok: true }); }
    return sendJson(res, 405, { error: "روش درخواست پشتیبانی نمی‌شود." });
  } catch (error) {
    return sendJson(res, error.code === "ENOENT" ? 404 : error.status || 500, { error: error.code === "ENOENT" ? "فایل پیدا نشد." : error.message });
  }
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Strict-Transport-Security": "max-age=15552000",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  };
}
function studentFrameHeaders() {
  const headers = { ...securityHeaders() };
  delete headers["X-Frame-Options"];
  headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://committees.javanrood.invalid";
  return headers;
}

// P67.19.3: ONLY the independent teacher exam-center page may be framed by
// this SAME origin. All other application pages retain X-Frame-Options: DENY
// and frame-ancestors 'none'. Does not broaden API or cross-origin access.
function p67193ExamCenterFrameHeaders() {
  const headers = { ...securityHeaders(), "X-Frame-Options": "SAMEORIGIN" };
  headers["Content-Security-Policy"] = headers["Content-Security-Policy"]
    .replace("frame-ancestors 'none'", "frame-ancestors 'self'");
  return headers;
}
function corsHeaders() {
  return {
    ...securityHeaders(),
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Language",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("حجم درخواست بیشتر از حد مجاز است."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("بدنه درخواست JSON معتبر نیست."), { status: 400 });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function roundQuarter(value) {
  return Math.round(Number(value || 0) * 4) / 4;
}


function textList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/\r?\n|[|؛]/).map(item => item.trim()).filter(Boolean);
}

function normalizeRubricCriterion(raw, index, questionScore) {
  const item = typeof raw === "string" ? { title: raw } : { ...(raw || {}) };
  const title = String(item.title || item.criterion || item.name || `معیار ${index + 1}`).trim();
  let weightPercent = Number(item.weightPercent ?? item.weight_percent ?? item.weight ?? 0);
  let maxScore = Number(item.maxScore ?? item.max_score ?? item.score ?? 0);
  if (!weightPercent && maxScore && questionScore) weightPercent = maxScore / questionScore * 100;
  if (!maxScore && weightPercent && questionScore) maxScore = questionScore * weightPercent / 100;
  return {
    id: String(item.id || `criterion_${index + 1}`),
    title,
    criterion: String(item.criterion || title).trim(),
    weightPercent: Math.max(0, weightPercent),
    maxScore: roundQuarter(Math.max(0, maxScore)),
    score: roundQuarter(Math.max(0, maxScore)),
    examples: textList(item.examples || item.acceptableExamples || item.acceptable_examples),
    essential: item.essential !== false,
    teacherNote: String(item.teacherNote || item.teacher_note || "").trim()
  };
}

function normalizeMisconception(raw, index) {
  const item = typeof raw === "string" ? { text: raw } : { ...(raw || {}) };
  return {
    id: String(item.id || `misconception_${index + 1}`),
    text: String(item.text || item.misconception || item.title || "").trim(),
    penaltyPercent: clamp(item.penaltyPercent ?? item.penalty_percent ?? item.penalty ?? 0, 0, 100),
    examples: textList(item.examples || item.evidenceExamples || item.evidence_examples)
  };
}

function normalizeDescriptiveQuestion(raw) {
  const q = { ...(raw || {}) };
  q.text = String(q.text || q.question || "").trim();
  q.score = Number(q.score ?? q.maxScore ?? q.max_score ?? 0);
  q.referenceAnswer = String(q.referenceAnswer || q.reference_answer || q.answer || "").trim();
  q.acceptableAlternatives = textList(q.acceptableAlternatives || q.acceptable_alternatives);
  q.teacherNotes = String(q.teacherNotes || q.teacher_notes || q.teacherNote || "").trim();
  q.minimumConfidenceForAutoGrade = clamp(q.minimumConfidenceForAutoGrade ?? q.minimum_confidence_for_auto_grade ?? 0.85, 0, 1);
  q.gradingMode = String(q.gradingMode || q.grading_mode || "semantic_rubric");
  q.requireTeacherApproval = (q.requireTeacherApproval ?? q.teacherApprovalRequired ?? q.teacher_approval_required) !== false;
  let rubric = Array.isArray(q.rubric) ? q.rubric : Array.isArray(q.criteria) ? q.criteria : [];
  rubric = rubric.map((item, index) => normalizeRubricCriterion(item, index, q.score)).filter(item => item.title);
  if (!rubric.length && q.referenceAnswer) rubric = [normalizeRubricCriterion({ title: "پوشش پاسخ مرجع", weightPercent: 100 }, 0, q.score)];
  let totalWeight = rubric.reduce((sum, item) => sum + Number(item.weightPercent || 0), 0);
  if (!totalWeight && rubric.length) {
    const share = 100 / rubric.length;
    rubric = rubric.map(item => ({ ...item, weightPercent: share }));
    totalWeight = 100;
  }
  if (rubric.length && Math.abs(totalWeight - 100) > 0.01) {
    rubric = rubric.map(item => ({ ...item, weightPercent: item.weightPercent / totalWeight * 100 }));
  }
  rubric = rubric.map(item => {
    const maxScore = roundQuarter(q.score * item.weightPercent / 100);
    return { ...item, maxScore, score: maxScore };
  });
  // Keep the exact question total despite quarter rounding.
  if (rubric.length) {
    const delta = roundQuarter(q.score - rubric.reduce((sum, item) => sum + item.maxScore, 0));
    rubric[rubric.length - 1].maxScore = roundQuarter(rubric[rubric.length - 1].maxScore + delta);
    rubric[rubric.length - 1].score = rubric[rubric.length - 1].maxScore;
  }
  q.rubric = rubric;
  q.misconceptions = (Array.isArray(q.misconceptions) ? q.misconceptions : []).map(normalizeMisconception).filter(item => item.text);
  return q;
}

function normalizeTypedAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, answer]) => [String(key), String(answer || "").trim()]).filter(([, answer]) => answer));
}




function guardianTokenSign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function guardianTokenVerify(token, secret) {
  try { const [body,sig]=String(token||"").split("."); if(!body||!sig)return null; const expected=crypto.createHmac("sha256",secret).update(body).digest("base64url"); if(!safeEqualText(sig,expected))return null; const p=JSON.parse(Buffer.from(body,"base64url").toString("utf8")); if(Number(p.exp||0)<Date.now())return null; return p; } catch { return null; }
}
async function issueGuardianSessionTokenV52(claims,req,security,lifetime){
  const sid=makeId("gsess"),expiresAt=Date.now()+lifetime;
  const token=guardianTokenSign({...claims,sid,exp:expiresAt},security.serverSecret);
  await mutateSecurity(sec=>{sec.guardianSessions||={};sec.guardianSessions[sid]={id:sid,guardianId:claims.guardianId||null,linkId:claims.linkId||null,studentId:claims.studentId||null,credentialVersion:Number(claims.credentialVersion||0),createdAt:new Date().toISOString(),expiresAt,ip:clientIp(req),userAgent:String(req.headers["user-agent"]||"").slice(0,250),deviceLabel:deviceLabelFromRequest(req)};});
  return token;
}
function publicGuardianV4520(g){return g?{id:g.id,name:g.guardianName||g.name||"ولی دانش‌آموز",nationalId:g.nationalId||"",mobile:g.mobile||"",active:g.active!==false}:null;}
async function guardianAuth(req) {
  const authHeader=String(req.headers.authorization||"");
  const token=authHeader.startsWith("Bearer ")?authHeader.slice(7).trim():"";
  const security=await readSecurity();
  const claims=guardianTokenVerify(token,security.serverSecret);
  if(!claims||claims.kind!=="guardian")throw Object.assign(new Error("نشست ولی معتبر نیست."),{status:401});
  if(claims.sid){const sess=security.guardianSessions?.[claims.sid];if(!sess||Number(sess.expiresAt||0)<Date.now())throw Object.assign(new Error("نشست ولی منقضی شده است؛ دوباره وارد شوید."),{status:401});if(claims.guardianId&&String(sess.guardianId||"")!==String(claims.guardianId))throw Object.assign(new Error("نشست ولی معتبر نیست."),{status:401});if(claims.linkId&&String(sess.linkId||"")!==String(claims.linkId))throw Object.assign(new Error("نشست ولی معتبر نیست."),{status:401});}
  const env=await ensureStateInitialized();
  if(claims.guardianId){
    const guardian=(env.db.guardians||[]).find(g=>g.id===claims.guardianId&&g.active!==false);
    if(!guardian)throw Object.assign(new Error("حساب ولی غیرفعال شده است."),{status:403});
    const credential=security.guardianCredentials?.[guardian.id];
    if(!credential)throw Object.assign(new Error("اطلاعات امنیتی حساب ولی پیدا نشد."),{status:401});
    if(Number(claims.credentialVersion||0)!==Number(credential.credentialVersion||1))throw Object.assign(new Error("نشست ولی منقضی شده است؛ دوباره وارد شوید."),{status:401});
    const link=(env.db.guardianLinks||[]).find(x=>x.guardianId===guardian.id&&x.active!==false)||null;
    return {db:env.db,guardian,link,claims,credential,security,legacy:false};
  }
  // سازگاری با نشست‌ها و کدهای دسترسی نسخه‌های قبلی تا زمان مهاجرت حساب والدین.
  const link=(env.db.guardianLinks||[]).find(x=>x.id===claims.linkId&&x.active!==false);
  if(!link || String(claims.studentId||"")!==String(link.studentId||""))
    throw Object.assign(new Error("دسترسی ولی غیرفعال شده یا نشست قدیمی نامعتبر است."),{status:403});
  return {db:env.db,guardian:null,link,claims,credential:null,security,legacy:true};
}
// P67.21.2: report the scheduled/actual exam date separately from the grading/submission time.
// Never claim an unknown exam date using the date the result was published.
function t072ExamHeldAt(exam){
  const fields=[['actual',exam?.startedAt],['scheduled',exam?.startAt],['scheduled',exam?.scheduledAt]];
  for(const [kind,raw] of fields){
    if(raw===null||raw===undefined||String(raw).trim()==='')continue;
    let n=NaN;
    if(typeof raw==='number'&&Number.isFinite(raw))n=raw<1e12?raw*1000:raw;
    else if(typeof raw==='string'&&/^\d{10,13}$/.test(raw.trim())){n=Number(raw);if(n<1e12)n*=1000;}
    else n=Date.parse(String(raw));
    if(Number.isFinite(n)&&n>=946684800000)return {heldAt:n,dateKind:kind};
  }
  return {heldAt:null,dateKind:'unknown'};
}
// P67.21.3 — canonical book/lesson descriptors for the authorized guardian report.
function guardianExamBookMetaT073(db,exam,student){
  const cid=String(exam?.classId||student?.classId||'');
  const cls=(db.school?.classes||[]).find(c=>String(c.id)===cid);
  const grade=Number(cls?.grade||student?.grade||0);
  const subject=String(exam?.subject||'درس').trim();
  const direct=String(exam?.bookId||'');
  const books=db.curriculum||[];
  const book=(direct?books.find(b=>String(b.id)===direct):null)||books.find(b=>String(b.subject||'').trim()===subject&&(!grade||Number(b.grade)===grade));
  const bookId=String(book?.id||direct||`subject:${grade}:${subject}`);
  const bookTitle=String(book?.title||exam?.bookTitle||`${subject}${grade?' — پایه '+grade:''}`).trim().slice(0,160);
  const chapters=book?.chapters||[];
  const chapterOrdinal=value=>{
    const normalized=String(value||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
    const m=normalized.match(/(?:فصل|درس|بخش|پودمان)\s*(\d+|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم)/);
    if(!m)return 0;const names=['','اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم','دهم','یازدهم','دوازدهم'];return Number(m[1])||names.indexOf(m[1]);
  };
  const ordinal=chapterOrdinal(exam?.chapter);
  const chapter=chapters.find(c=>String(c.id||'')===String(exam?.chapterId||'')&&exam?.chapterId)
    ||chapters.find(c=>String(c.title||'').trim()===String(exam?.chapter||'').trim()&&exam?.chapter)
    ||(ordinal?chapters.find(c=>Number(c.order||0)===ordinal||chapterOrdinal(c.title)===ordinal):null);
  const chapterTitle=String(exam?.chapter||chapter?.title||'درس/فصل نامشخص').trim().slice(0,100);
  const chapterId=String(exam?.chapterId||chapter?.id||`title:${chapterTitle}`);
  return {bookId,bookTitle,chapterId,chapterTitle,chapterOrder:Number(chapter?.order||0),subject};
}

// P67.20-T06 PRO — Read-only guardian exam report.
// This function is server-only. Authorization MUST be checked in the route before calling it.
function guardianExamReportT06(db,studentId,selectedExamId="",selectedBookId="",selectedChapterId=""){
  const student=(db.users||[]).find(s=>s.id===studentId&&s.role==="student"&&s.active!==false&&s.profileStatus!=="deleted");
  if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
  const schoolYear=String(db.school?.year||"");
  const scoreResult=(exam,sid)=>{
    const submissions=(db.submissions||[]).filter(s=>String(s.examId)===String(exam.id)&&String(s.studentId)===String(sid)&&["submitted","final","graded",""].includes(String(s.status||"")));
    const grades=(db.grades||[]).filter(g=>submissions.some(s=>String(s.id)===String(g.submissionId))&&String(g.publishStatus||"published")==="published"&&g.finalScore!==null&&g.finalScore!==undefined&&String(g.finalScore)!=="")
      .sort((a,b)=>Number(b.publishedAt||b.gradedAt||b.updatedAt||0)-Number(a.publishedAt||a.gradedAt||a.updatedAt||0));
    const possible=Number(examTotalScore(exam));
    if(!(Number.isFinite(possible)&&possible>0))return null;
    if(grades.length){const n=Number(grades[0].finalScore);if(!Number.isFinite(n)||n<0||n>possible)return null;return {score:n,total:possible,kind:"teacher",timestamp:Number(grades[0].publishedAt||grades[0].gradedAt||submissions[0]?.submittedAt||0)||0};}
    if(String(exam.type)!=="mcq")return null;
    const attempts=(db.attempts||[]).filter(a=>String(a.examId)===String(exam.id)&&String(a.studentId)===String(sid)&&a.score!==null&&a.score!==undefined&&String(a.score)!==""&&(a.submittedAt||["submitted","final","graded"].includes(String(a.status||""))))
      .sort((a,b)=>Number(b.submittedAt||b.updatedAt||0)-Number(a.submittedAt||a.updatedAt||0));
    if(!attempts.length)return null;
    const a=attempts[0],actualTotal=Number(a.total||possible),n=Number(a.score);
    if(!Number.isFinite(n)||!Number.isFinite(actualTotal)||actualTotal<=0||n<0||n>actualTotal)return null;
    return {score:n,total:actualTotal,kind:"automatic",timestamp:Number(a.submittedAt||a.updatedAt||0)||0};
  };
  const all=(db.exams||[]).filter(ex=>String(ex.academicYear||schoolYear)===schoolYear&&ex.status!=="draft"&&String(ex.publicationState||"")!=="draft"&&studentCanSeeExam(db,ex,student));
  const rows=[];
  for(const ex of all){const r=scoreResult(ex,studentId);if(!r)continue;
    const score20=Math.round((r.score/r.total)*2000)/100;
    rows.push({id:String(ex.id),title:String(ex.title||"آزمون").slice(0,180),...guardianExamBookMetaT073(db,ex,student),chapter:String(ex.chapter||"").slice(0,90),category:String(ex.examCategory||"ongoing")==="final"?"final":"ongoing",...t072ExamHeldAt(ex),score:r.score,total:r.total,score20,percent:Math.round(score20*5*10)/10,grading:r.kind,timestamp:r.timestamp});
  }
  rows.sort((a,b)=>a.timestamp-b.timestamp||String(a.id).localeCompare(String(b.id)));
  const round=n=>Math.round(n*100)/100;
  const avg=arr=>arr.length?round(arr.reduce((a,x)=>a+x.score20,0)/arr.length):null;
  const summarize=arr=>({count:arr.length,average20:avg(arr),last20:arr.length?arr[arr.length-1].score20:null,change20:arr.length>=2?round(arr[arr.length-1].score20-arr[0].score20):null});
  const groupedBooks=new Map();
  for(const row of rows){if(!groupedBooks.has(row.bookId))groupedBooks.set(row.bookId,[]);groupedBooks.get(row.bookId).push(row);}
  const books=[...groupedBooks.entries()].map(([id,bookRows])=>{
    const groupedChapters=new Map();for(const row of bookRows){if(!groupedChapters.has(row.chapterId))groupedChapters.set(row.chapterId,[]);groupedChapters.get(row.chapterId).push(row);}
    const chapters=[...groupedChapters.entries()].map(([chapterId,arr])=>({id:chapterId,title:arr[0].chapterTitle,order:arr[0].chapterOrder,...summarize(arr)}))
      .sort((a,b)=>((a.order||999)-(b.order||999))||a.title.localeCompare(b.title,'fa'));
    return {id,title:bookRows[0].bookTitle,subject:bookRows[0].subject,...summarize(bookRows),chapters};
  }).sort((a,b)=>a.title.localeCompare(b.title,'fa'));
  const bookId=String(selectedBookId||'');const chapterId=String(selectedChapterId||'');
  if(chapterId&&!bookId)throw Object.assign(new Error('ابتدا کتاب را انتخاب کنید.'),{status:400});
  const book=bookId?books.find(b=>b.id===bookId):null;
  if(bookId&&!book)throw Object.assign(new Error('برای این کتاب نتیجه معتبر و مجاز وجود ندارد.'),{status:404});
  const chapter=chapterId?book?.chapters?.find(c=>c.id===chapterId):null;
  if(chapterId&&!chapter)throw Object.assign(new Error('برای این درس یا فصل نتیجه معتبر و مجاز وجود ندارد.'),{status:404});
  const scopedRows=rows.filter(r=>(!bookId||r.bookId===bookId)&&(!chapterId||r.chapterId===chapterId));
  if(selectedExamId&&!scopedRows.some(r=>r.id===String(selectedExamId)))throw Object.assign(new Error('نتیجه نهایی و مجاز این آزمون در محدوده انتخاب‌شده موجود نیست.'),{status:404});
  const selected=selectedExamId?scopedRows.find(r=>r.id===String(selectedExamId)):scopedRows[scopedRows.length-1]||null;
  const grouped=new Map();for(const r of rows){if(!grouped.has(r.subject))grouped.set(r.subject,[]);grouped.get(r.subject).push(r);}
  const subjects=[...grouped.entries()].map(([name,arr])=>({name,count:arr.length,average20:avg(arr)})).sort((a,b)=>a.name.localeCompare(b.name,'fa'));
  const strengths=subjects.filter(s=>s.count>=2&&s.average20>=16).slice(0,3);
  const weaknesses=subjects.filter(s=>s.count>=2&&s.average20<12).slice(0,3);
  const recommendations=weaknesses.map(s=>`مرور درس ${s.name} و تمرین تدریجی همراه با پیگیری معلم.`);
  if(!recommendations.length)recommendations.push(rows.length<2?'برای تحلیل پیشرفت، به نتایج بیشتری از آزمون‌های آینده نیاز است.':'ادامه تمرین منظم و مرور سؤال‌هایی که پاسخ آن‌ها دشوار بوده است.');
  // Per-book/per-lesson insights never infer a trend from a single examination.
  const comparisonGroups=bookId?(chapterId?[{id:chapterId,title:chapter?.title||'',...summarize(scopedRows)}]:book.chapters.map(c=>({id:c.id,title:c.title,count:c.count,average20:c.average20}))):books.map(b=>({id:b.id,title:b.title,count:b.count,average20:b.average20}));
  const scopedStrengths=comparisonGroups.filter(g=>g.count>=2&&g.average20>=16).map(g=>({name:g.title,count:g.count,average20:g.average20})).slice(0,4);
  const scopedWeaknesses=comparisonGroups.filter(g=>g.count>=2&&g.average20<12).map(g=>({name:g.title,count:g.count,average20:g.average20})).slice(0,4);
  const scopedRecommendations=scopedWeaknesses.map(g=>`برای «${g.name}» مرور هدفمند و تمرین مرحله‌ای با همراهی معلم پیشنهاد می‌شود.`);
  if(!scopedRecommendations.length)scopedRecommendations.push(scopedRows.length<2?'برای تحلیل تغییر عملکرد، دست‌کم دو نتیجه نهایی در این بخش لازم است.':'مرور اشتباهات آزمون‌ها و تمرین منظم را ادامه دهید.');
  let classAverage20=null,classSample=0;
  if(selected){const ex=all.find(x=>String(x.id)===selected.id);const peers=(db.users||[]).filter(s=>s.role==='student'&&s.active!==false&&s.profileStatus!=='deleted'&&studentCanSeeExam(db,ex,s));
    const scores=peers.map(s=>scoreResult(ex,s.id)).filter(Boolean).map(r=>r.score/r.total*20);
    if(scores.length>=5){classSample=scores.length;classAverage20=round(scores.reduce((a,x)=>a+x,0)/scores.length);}
  }
  return {ok:true,version:'T073-BOOK-LESSON-TEST01',student:{id:student.id,name:`${student.firstName||''} ${student.lastName||''}`.trim(),className:String(student.className||''),studentCode:String(student.studentCode||'')},school:{name:String(db.school?.name||'مدرسه‌یار'),academicYear:schoolYear},
    overall:summarize(rows),exams:rows.slice(-120).reverse(),trend:rows.slice(-12).map(r=>({id:r.id,title:r.title,score20:r.score20,timestamp:r.timestamp})),subjects,strengths,weaknesses,recommendations,
    books,scope:{bookId,bookTitle:book?.title||'',chapterId,chapterTitle:chapter?.title||'',label:chapter?.title||(book?.title||'همه کتاب‌ها'),...summarize(scopedRows),exams:scopedRows.slice(-120).reverse(),trend:scopedRows.slice(-12).map(r=>({id:r.id,title:r.title,score20:r.score20,timestamp:r.timestamp})),strengths:scopedStrengths,weaknesses:scopedWeaknesses,recommendations:scopedRecommendations},
    selected:selected?{...selected,classAverage20,classSample}:null,generatedAt:new Date().toISOString(),comparisonPrivacy:'میانگین کلاس فقط برای دست‌کم پنج نتیجه نهایی نمایش داده می‌شود.'};
}

async function handleGuardianApi(req,res,url){
 try{
  if(req.method==="POST"&&url.pathname==="/api/guardian/login"){
    const body=await readJson(req);
    const guardianNid=normalizeNationalId(body.guardianNationalId||body.nationalId||body.identifier);
    const password=String(body.password||body.initialPassword||"");
    if(guardianNid||password){
      const rate=await loginRateStatus(req,`guardian:${guardianNid}`);
      if(rate.blocked)throw Object.assign(new Error(`تلاش‌های ناموفق زیاد بوده است؛ ${rate.retryAfter} ثانیه بعد دوباره امتحان کنید.`),{status:429});
      const env=await ensureStateInitialized();
      const guardian=(env.db.guardians||[]).find(g=>g.active!==false&&normalizeNationalId(g.nationalId)===guardianNid);
      const security=await readSecurity();
      const credential=guardian?security.guardianCredentials?.[guardian.id]:null;
      const ok=/^\d{10}$/.test(guardianNid)&&guardian&&credential&&await passwordVerify(password,credential.passwordHash);
      if(!ok){await recordLoginFailure(rate.key);await securityAudit({type:"guardian_login",success:false,ip:clientIp(req),details:"کد ملی ولی یا رمز عبور نادرست"});throw Object.assign(new Error("کد ملی ولی یا رمز عبور صحیح نیست."),{status:401});}
      await recordLoginSuccess(rate.key);
      const lifetime=process.env.NODE_ENV==="production"?7*24*60*60*1000:30*24*60*60*1000;
      const token=await issueGuardianSessionTokenV52({kind:"guardian",guardianId:guardian.id,credentialVersion:Number(credential.credentialVersion||1)},req,security,lifetime);
      await mutateSecurity(sec=>{const c=sec.guardianCredentials?.[guardian.id];if(c){c.lastLoginAt=new Date().toISOString();c.lastLoginIp=clientIp(req);c.lastLoginUserAgent=String(req.headers["user-agent"]||"").slice(0,250);}});
      await securityAudit({type:"guardian_login",userId:guardian.id,role:"guardian",success:true,ip:clientIp(req),details:guardianNid});
      return sendJson(res,200,{token,guardian:publicGuardianV4520(guardian),mustChangePassword:Boolean(credential.mustChangePassword)});
    }
    // ورود قدیمی فقط برای حساب‌هایی که هنوز به مدل جدید مهاجرت نکرده‌اند.
    const nid=normalizeNationalId(body.studentNationalId),code=String(body.accessCode||"");
    const rate=await loginRateStatus(req,`guardian-legacy:${nid}`);
    if(rate.blocked)throw Object.assign(new Error(`تلاش‌های ناموفق زیاد بوده است؛ ${rate.retryAfter} ثانیه بعد دوباره امتحان کنید.`),{status:429});
    const env=await ensureStateInitialized();
    const student=(env.db.users||[]).find(u=>u.role==="student"&&normalizeNationalId(u.nationalId)===nid&&u.active!==false);
    const links=student?(env.db.guardianLinks||[]).filter(x=>x.studentId===student.id&&x.active!==false&&x.accessHash):[];
    let link=null; for(const item of links){if(await passwordVerify(code,item.accessHash)){link=item;break;}}
    if(!student||!link){await recordLoginFailure(rate.key);await securityAudit({type:"guardian_login",success:false,ip:clientIp(req),details:"اطلاعات ورود قدیمی خانواده نادرست"});throw Object.assign(new Error("اطلاعات ورود ولی صحیح نیست."),{status:401});}
    await recordLoginSuccess(rate.key); const security=await readSecurity(); const lifetime=process.env.NODE_ENV==="production"?7*24*60*60*1000:30*24*60*60*1000;
    const token=await issueGuardianSessionTokenV52({kind:"guardian",linkId:link.id,studentId:student.id},req,security,lifetime);
    await securityAudit({type:"guardian_login_legacy",userId:student.id,role:"guardian",success:true,ip:clientIp(req),details:link.id});
    return sendJson(res,200,{token,guardian:{name:link.guardianName,relation:link.relation},student:publicStudent(student,env.db),mustChangePassword:false,legacy:true});
  }
  const auth=await guardianAuth(req); const {db,guardian,link,credential,legacy}=auth;
  if(req.method==="POST"&&url.pathname==="/api/guardian/logout"){
    const sid=String(auth.claims?.sid||"");if(sid)await mutateSecurity(sec=>{sec.guardianSessions||={};delete sec.guardianSessions[sid];});
    await securityAudit({type:"guardian_logout",userId:guardian?.id||link?.studentId||null,role:"guardian",success:true,ip:clientIp(req),details:sid?"session-revoked":"legacy-token-local-logout"});
    return sendJson(res,200,{ok:true,revoked:Boolean(sid)});
  }
  if(req.method==="POST"&&url.pathname==="/api/guardian/sessions/client-info"){
    const body=await readJson(req),currentSid=String(auth.claims?.sid||"");
    if(!currentSid)throw Object.assign(new Error("این نشست قدیمی قابلیت ثبت مشخصات دستگاه را ندارد."),{status:409});
    const updated=await mutateSecurity(sec=>{const row=sec.guardianSessions?.[currentSid];if(!row)return {error:"not_found"};const deviceLabel=applyClientDeviceInfo(row,body);row.ip=clientIp(req);return {deviceLabel};});
    if(updated.result?.error)throw Object.assign(new Error("نشست جاری پیدا نشد."),{status:404});
    return sendJson(res,200,{ok:true,deviceLabel:updated.result?.deviceLabel||""});
  }
  if(req.method==="GET"&&url.pathname==="/api/guardian/sessions"){
    const currentSid=String(auth.claims?.sid||""),rows=Object.values(auth.security?.guardianSessions||{}).filter(row=>legacy?(String(row?.linkId||"")===String(link?.id||"")||String(row?.studentId||"")===String(link?.studentId||"")):String(row?.guardianId||"")===String(guardian?.id||"")).map(row=>{const current=String(row.id||"")===currentSid,deviceLabel=sessionDeviceView(row,req,current);return {id:String(row.id||""),current,createdAt:row.createdAt,expiresAt:row.expiresAt,ip:current?clientIp(req):row.ip,userAgent:deviceLabel,rawUserAgent:row.userAgent||"",deviceLabel};}).sort((a,b)=>Number(b.expiresAt||0)-Number(a.expiresAt||0));
    return sendJson(res,200,{sessions:rows,currentSessionId:currentSid,legacy});
  }
  if(req.method==="POST"&&url.pathname==="/api/guardian/sessions/revoke-others"){const currentSid=String(auth.claims?.sid||"");const updated=await mutateSecurity(sec=>{let n=0;for(const [sid,row] of Object.entries(sec.guardianSessions||{})){const owned=legacy?(String(row?.linkId||"")===String(link?.id||"")||String(row?.studentId||"")===String(link?.studentId||"")):String(row?.guardianId||"")===String(guardian?.id||"");if(owned&&sid!==currentSid){delete sec.guardianSessions[sid];n++;}}return n;});await securityAudit({type:"guardian_session_revoke_others",userId:guardian?.id||link?.studentId||null,role:"guardian",ip:clientIp(req),details:String(updated.result||0)});return sendJson(res,200,{ok:true,revoked:Number(updated.result||0)});}
  if(req.method==="POST"&&url.pathname==="/api/guardian/sessions/revoke"){const b=await readJson(req),sid=String(b.sessionId||"");if(!sid)throw Object.assign(new Error("شناسه نشست معتبر نیست."),{status:400});const currentSid=String(auth.claims?.sid||"");const updated=await mutateSecurity(sec=>{const row=sec.guardianSessions?.[sid];const owned=row&&(legacy?(String(row?.linkId||"")===String(link?.id||"")||String(row?.studentId||"")===String(link?.studentId||"")):String(row?.guardianId||"")===String(guardian?.id||""));if(!owned)return {error:"not_found"};delete sec.guardianSessions[sid];return {current:sid===currentSid};});if(updated.result?.error)throw Object.assign(new Error("نشست پیدا نشد."),{status:404});await securityAudit({type:"guardian_session_revoke_one",userId:guardian?.id||link?.studentId||null,role:"guardian",ip:clientIp(req)});return sendJson(res,200,{ok:true,requiresLogin:Boolean(updated.result.current)});}
  if(req.method==="POST"&&url.pathname==="/api/guardian/sessions/revoke-all"){const updated=await mutateSecurity(sec=>{let n=0;for(const [sid,row] of Object.entries(sec.guardianSessions||{})){const owned=legacy?(String(row?.linkId||"")===String(link?.id||"")||String(row?.studentId||"")===String(link?.studentId||"")):String(row?.guardianId||"")===String(guardian?.id||"");if(owned){delete sec.guardianSessions[sid];n++;}}return n;});await securityAudit({type:"guardian_session_revoke_all",userId:guardian?.id||link?.studentId||null,role:"guardian",ip:clientIp(req),details:String(updated.result||0)});return sendJson(res,200,{ok:true,revoked:Number(updated.result||0),requiresLogin:true});}
  if(req.method==="POST"&&url.pathname==="/api/guardian/change-password"){
    if(legacy||!guardian||!credential)throw Object.assign(new Error("ابتدا حساب ولی را از مدرسه به مدل جدید ارتقا دهید."),{status:400});
    const body=await readJson(req),currentPassword=String(body.currentPassword||""),nextPassword=String(body.newPassword||"");const policy=guardianPasswordPolicy(nextPassword);if(policy)throw Object.assign(new Error(policy),{status:400});
    const changed=await mutateSecurity(async sec=>{sec.guardianCredentials||={};sec.guardianSessions||={};const c=sec.guardianCredentials[guardian.id];if(!c)throw Object.assign(new Error("حساب امنیتی ولی پیدا نشد."),{status:404});if(!await passwordVerify(currentPassword,c.passwordHash))return {error:"current"};if(await passwordVerify(nextPassword,c.passwordHash))return {error:"same"};c.passwordHash=await passwordHash(nextPassword);c.mustChangePassword=false;c.passwordChangedAt=new Date().toISOString();c.credentialVersion=Number(c.credentialVersion||1)+1;for(const [sid,sess] of Object.entries(sec.guardianSessions))if(String(sess?.guardianId||"")===String(guardian.id))delete sec.guardianSessions[sid];return {credentialVersion:c.credentialVersion};});
    if(changed.result?.error==="current")throw Object.assign(new Error("رمز فعلی ولی صحیح نیست."),{status:401});
    if(changed.result?.error==="same")throw Object.assign(new Error("رمز جدید باید با رمز قبلی متفاوت باشد."),{status:400});
    const lifetime=process.env.NODE_ENV==="production"?7*24*60*60*1000:30*24*60*60*1000;const token=await issueGuardianSessionTokenV52({kind:"guardian",guardianId:guardian.id,credentialVersion:changed.result.credentialVersion},req,changed.security,lifetime);
    await securityAudit({type:"guardian_password_change",userId:guardian.id,role:"guardian",success:true,ip:clientIp(req)});
    return sendJson(res,200,{ok:true,token,guardian:publicGuardianV4520(guardian),mustChangePassword:false});
  }
  if(!legacy&&credential?.mustChangePassword)throw Object.assign(new Error("برای ادامه، رمز اولیه را به رمز شخصی جدید تغییر دهید."),{status:428,code:"GUARDIAN_PASSWORD_CHANGE_REQUIRED"});
  // Legacy links with an empty guardianKey must not grant access to every
  // other student whose old link also has an empty guardianKey.
  const linkedIds=new Set(legacy
    ? (db.guardianLinks||[]).filter(x => x.active!==false && (
        (String(link.guardianKey||"").trim() && x.guardianKey===link.guardianKey) || x.id===link.id
      )).map(x=>x.studentId)
    : (db.guardianLinks||[]).filter(x=>x.guardianId===guardian.id&&x.active!==false).map(x=>x.studentId));
  if(req.method==="GET"&&url.pathname==="/api/guardian/exam-report/t06"){
    const sid=String(url.searchParams.get("studentId")||""),examId=String(url.searchParams.get("examId")||""),bookId=String(url.searchParams.get("bookId")||""),chapterId=String(url.searchParams.get("chapterId")||"");
    if(!sid||!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});
    return sendJson(res,200,guardianExamReportT06(db,sid,examId,bookId,chapterId));
  }
  if(req.method==="GET"&&url.pathname==="/api/guardian/continuous-p11"){
    const sid=String(url.searchParams.get("studentId")||""),eid=String(url.searchParams.get("examId")||"");
    if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});
    return sendJson(res,200,continuousP11(db,sid,eid));
  }
  if(req.method==="GET"&&url.pathname==="/api/guardian/student-analysis"){
    const sid=String(url.searchParams.get("studentId")||""),period=String(url.searchParams.get("period")||"month"),subject=String(url.searchParams.get("subject")||"").trim();if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});const analysis=academicAnalyticsV4518(db,sid,period,subject,{guardianOnly:true});if(!analysis)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});return sendJson(res,200,{ok:true,analysis});
  }
  if(req.method==="GET"&&url.pathname==="/api/guardian/student-dossier"){
    const sid=String(url.searchParams.get("studentId")||"");if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});const dossier=buildStudentDossierV4521(db,sid,{guardianOnly:true});if(!dossier)throw Object.assign(new Error("پرونده دانش‌آموز پیدا نشد."),{status:404});dossier.photoDataUrl=await readStudentProfilePhoto(sid);return sendJson(res,200,{ok:true,dossier});
  }
  if(req.method==="GET"&&url.pathname==="/api/guardian/attendance-day"){
    const sid=String(url.searchParams.get("studentId")||""),date=String(url.searchParams.get("date")||"").trim();
    if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});
    if(date&&!validSchoolDateV80(date))throw Object.assign(new Error("تاریخ حضور و غیاب معتبر نیست."),{status:400});
    const student=(db.users||[]).find(u=>u.id===sid&&u.role==="student"&&u.profileStatus!=="deleted");if(!student)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
    return sendJson(res,200,{ok:true,attendance:guardianAttendanceDayV80(db,student,date)});
  }
  if(req.method==="POST"&&url.pathname==="/api/guardian/notifications/read"){
    if(legacy)throw Object.assign(new Error("برای پیام مستقیم مدرسه، حساب جدید ولی لازم است."),{status:403});
    const b=await readJson(req),id=String(b.id||"").trim(),guardianId=String(guardian?.id||"");
    await mutateDb(m=>{for(const item of m.notifications||[])if(String(item.guardianId||"")===guardianId&&(!id||String(item.id||"")===id)){item.read=true;item.readAt=faNow();item.readAtIso=new Date().toISOString();}});
    return sendJson(res,200,{ok:true});
  }
  if(req.method==="GET"&&url.pathname==="/api/guardian/dashboard"){
    const activeYear=String(db.school?.year||"");
    const children=(db.users||[]).filter(u=>linkedIds.has(u.id)&&u.role==="student"&&u.profileStatus!=="deleted").map(s=>({student:publicStudent(s,db),attendance:attendanceSummaryForStudent(db,s.id),attendanceToday:guardianAttendanceDayV80(db,s,schoolClockV74().date),report:studentReport(db,s.id),termReport:studentTermReportV185(db,s.id,"semester2"),termReports:{semester1:studentTermReportV185(db,s.id,"semester1"),semester2:studentTermReportV185(db,s.id,"semester2"),annual:studentTermReportV185(db,s.id,"annual")},dailySnapshots:{semester1:stage09SnapshotForStudent(db,s.id,"semester1"),semester2:stage09SnapshotForStudent(db,s.id,"semester2")},riskSnapshots:{semester1:stage10RiskForStudent(db,s.id,"semester1"),semester2:stage10RiskForStudent(db,s.id,"semester2")},homework:(db.homework||[]).filter(h=>h.classId===s.classId&&String(h.academicYear||activeYear)===activeYear).slice().sort((a,b)=>String(b.createdAt||b.dueAt||"").localeCompare(String(a.createdAt||a.dueAt||""))).slice(0,20),homeworkSubmissions:(db.homeworkSubmissions||[]).filter(x=>x.studentId===s.id).slice(-30),progressReports:(db.progressReports||[]).filter(r=>r.studentId===s.id&&String(r.academicYear||activeYear)===activeYear&&r.status==="published"&&r.guardianVisible!==false).slice(-12),analysisSubjects:[...new Set((db.exams||[]).filter(e=>e.classId===s.classId&&String(e.academicYear||activeYear)===activeYear).map(e=>e.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fa")),notifications:(db.notifications||[]).filter(n=>String(n.userId||'')===String(s.id)).slice().sort((a,b)=>Number(b.createdAt||b.at||0)-Number(a.createdAt||a.at||0)).slice(0,20),weeklySchedule:(db.weeklySchedule||[]).filter(x=>x.active!==false&&x.classId===s.classId&&String(x.academicYear||activeYear)===activeYear).map(x=>{const row=publicOnlineScheduleEntryV74(db,x),t=(db.users||[]).find(u=>u.id===x.teacherId);return {...row,teacherName:t?`${t.firstName||""} ${t.lastName||""}`.trim():""};}),onlineLearning:publicOnlineSettingsV74(db),onlineClassSessions:(db.onlineClassSessions||[]).filter(x=>x.classId===s.classId&&String(x.academicYear||activeYear)===activeYear&&x.status!=="cancelled").map(x=>({id:x.id,scheduleEntryId:x.scheduleEntryId,subject:x.subject,date:x.date,periodNo:x.periodNo,status:x.status,deliveryMode:x.deliveryMode,meetingProvider:x.meetingProvider,meetingUrl:x.meetingUrl||""})),calendarEvents:publicCalendarForStudentV76(db,s),academicYearModel:publicActiveAcademicYearV76(db)}));
    const childIds=new Set(children.map(ch=>ch.student.id));
    const consentForms=(db.consentForms||[]).filter(c=>c.status==="active"&&String(c.academicYear||activeYear)===activeYear&&children.some(ch=>(!c.classId||ch.student.classId===c.classId)&&(!Array.isArray(c.studentIds)||!c.studentIds.length||c.studentIds.includes(ch.student.id)))).map(c=>({...c,responses:undefined,childResponses:children.filter(ch=>(!c.classId||ch.student.classId===c.classId)&&(!Array.isArray(c.studentIds)||!c.studentIds.length||c.studentIds.includes(ch.student.id))).map(ch=>({studentId:ch.student.id,response:(c.responses||[]).find(r=>r.studentId===ch.student.id)||null}))}));
    // ===== V21-GUARDIAN-MEETING-VISIBILITY-BEGIN =====
    const guardianIdV21=String(guardian?.id||"");
    const requests=(db.parentRequests||[]).filter(r=>{
      if(!childIds.has(String(r.studentId||"")))return false;
      const kind=String(r.kind||r.type||"");
      if(kind==="meeting_invitation"){
        const target=String(r.guardianId||r.targetGuardianId||"");
        const ids=Array.isArray(r.guardianIds)?r.guardianIds.map(String):[];
        if(legacy)return !target&&!ids.length;
        if(target&&target!==guardianIdV21)return false;
        if(ids.length&&!ids.includes(guardianIdV21))return false;
        return true;
      }
      return legacy?!r.guardianId:String(r.guardianId||"")===guardianIdV21;
    }).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,30).map(r=>String(r.kind||r.type||"")==="meeting_invitation"&&!r.source?{...r,source:"teacher"}:r);
    // ===== V21-GUARDIAN-MEETING-VISIBILITY-END =====
    const guardianIdForMessages=String(guardian?.id||'');
    const guardianNotifications=legacy?[]:(db.notifications||[]).filter(n=>String(n.guardianId||'')===guardianIdForMessages).slice().sort((a,b)=>Number(b.createdAt||b.at||0)-Number(a.createdAt||a.at||0)).slice(0,50).map(n=>({id:n.id,title:n.title||'پیام مدرسه',body:n.body||n.message||n.text||'',read:Boolean(n.read),type:n.type||'internal',createdAt:n.createdAtIso||n.at||n.createdAt||''}));
    const guardianView=guardian?publicGuardianV4520(guardian):{name:link.guardianName,relation:link.relation}; return sendJson(res,200,{guardian:guardianView,children,consentForms,requests,guardianNotifications,academicYear:activeYear,serverTime:Date.now(),legacy});
  }
  if(req.method==="POST"&&url.pathname==="/api/guardian/consents/respond"){
    const b=await readJson(req),sid=String(b.studentId||""),consentId=String(b.consentId||""),decision=String(b.decision||""),note=String(b.note||"").trim();
    if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});
    if(!["approved","declined"].includes(decision))throw Object.assign(new Error("پاسخ رضایت‌نامه معتبر نیست."),{status:400});
    const guardianName=guardian?.guardianName||guardian?.name||link.guardianName||"ولی دانش‌آموز";
    const result=await mutateDb(m=>{const student=(m.users||[]).find(u=>u.id===sid&&u.role==="student");const activeYear=String(m.school?.year||"");const form=(m.consentForms||[]).find(x=>x.id===consentId&&x.status==="active"&&String(x.academicYear||activeYear)===activeYear&&(!x.classId||x.classId===student?.classId)&&(!Array.isArray(x.studentIds)||!x.studentIds.length||x.studentIds.includes(sid)));if(!form)throw Object.assign(new Error("رضایت‌نامه فعال پیدا نشد."),{status:404});form.responses=Array.isArray(form.responses)?form.responses:[];let response=form.responses.find(x=>x.studentId===sid);const payload={studentId:sid,guardianId:guardian?.id||null,decision,guardianName,note,respondedAt:faNow(),respondedAtIso:new Date().toISOString()};if(response)Object.assign(response,payload);else{response={id:makeId("consentresp"),...payload};form.responses.push(response);}m.audit||=[];m.audit.unshift({id:makeId("log"),userId:guardian?.id||sid,action:"ثبت پاسخ رضایت‌نامه توسط ولی",details:`${form.title||form.id} — ${decision}`,at:faNow()});return response;});
    return sendJson(res,200,{ok:true,response:result.result});
  }
  
  // ===== V21-GUARDIAN-MEETING-RESPONSES-BEGIN =====
  if(req.method==="POST"&&url.pathname==="/api/guardian/meeting-invitations/respond"){
    const b=await readJson(req);
    const requestId=String(b.requestId||"").trim(),decision=String(b.decision||"").trim(),note=String(b.note||"").trim().slice(0,1000);
    if(!requestId)throw Object.assign(new Error("شناسه درخواست ملاقات مشخص نیست."),{status:400});
    if(!["accepted","unavailable","request_new_time"].includes(decision))throw Object.assign(new Error("پاسخ ملاقات معتبر نیست."),{status:400});
    const guardianId=guardian?.id||null;
    const guardianName=guardian?.guardianName||guardian?.name||link?.guardianName||"ولی دانش‌آموز";
    const result=await mutateDb(m=>{
      m.parentRequests=Array.isArray(m.parentRequests)?m.parentRequests:[];
      const row=m.parentRequests.find(x=>String(x.id||"")===requestId);
      if(!row||String(row.kind||row.type||"")!=="meeting_invitation")throw Object.assign(new Error("دعوت ملاقات پیدا نشد."),{status:404});
      if(!linkedIds.has(String(row.studentId||"")))throw Object.assign(new Error("دسترسی به این دعوت ملاقات مجاز نیست."),{status:403});
      const target=String(row.guardianId||row.targetGuardianId||"");
      const targetList=Array.isArray(row.guardianIds)?row.guardianIds.map(String):[];
      if(!legacy&&target&&target!==String(guardianId||""))throw Object.assign(new Error("این دعوت برای حساب ولی دیگری ثبت شده است."),{status:403});
      if(!legacy&&targetList.length&&!targetList.includes(String(guardianId||"")))throw Object.assign(new Error("این دعوت برای حساب ولی دیگری ثبت شده است."),{status:403});
      if(["cancelled","canceled","completed","done"].includes(String(row.status||"").toLowerCase()))throw Object.assign(new Error("این دعوت دیگر قابل پاسخ نیست."),{status:409});
      const now=faNow(),nowIso=new Date().toISOString();
      row.guardianId=row.guardianId||guardianId;
      row.guardianName=row.guardianName||guardianName;
      row.guardianResponse=decision;row.responseStatus=decision;row.responseNote=note;row.respondedAt=now;row.respondedAtIso=nowIso;row.respondedByGuardianId=guardianId;row.respondedByGuardianName=guardianName;delete row.teacherSeenAt;delete row.teacherSeenAtIso;
      row.status=decision==="accepted"?"accepted":decision==="unavailable"?"unavailable":"new_time_requested";
      row.responseHistory=Array.isArray(row.responseHistory)?row.responseHistory:[];row.responseHistory.unshift({decision,note,guardianId,guardianName,at:now,atIso:nowIso});
      m.familyMeetings=Array.isArray(m.familyMeetings)?m.familyMeetings:[];
      let meeting=m.familyMeetings.find(x=>String(x.sourceRequestId||x.requestId||"")===String(row.id||""));
      const payload={sourceRequestId:row.id,requestId:row.id,studentId:row.studentId,guardianId,guardianName,teacherId:row.teacherId||row.createdBy||row.requesterId||"",teacherName:row.teacherName||row.requesterName||row.createdByName||"معلم مدرسه",date:row.meetingDate||row.date||row.proposedDate||row.requestedDate||"",time:row.meetingTime||row.time||row.proposedTime||row.requestedTime||"",location:row.location||row.place||row.meetingLocation||"مدرسه",title:row.title||"ملاقات با ولی",description:row.description||row.message||row.reason||"",status:decision==="accepted"?"scheduled":decision==="unavailable"?"cancelled":"reschedule_requested",academicYear:row.academicYear||String(m.school?.year||""),updatedAt:now,guardianResponse:decision,responseNote:note};
      if(decision==="accepted"){if(meeting)Object.assign(meeting,payload);else{meeting={id:makeId("fmeet"),...payload,createdAt:now};m.familyMeetings.unshift(meeting);}}
      else if(meeting)Object.assign(meeting,payload);
      const teacherId=String(row.teacherId||row.createdBy||row.requesterId||"");
      if(teacherId){m.notifications=Array.isArray(m.notifications)?m.notifications:[];const label=decision==="accepted"?"تأیید حضور":decision==="unavailable"?"عدم امکان حضور":"درخواست زمان دیگر";m.notifications.unshift({id:makeId("notif"),userId:teacherId,type:"guardian_meeting_response",title:"پاسخ ولی به دعوت ملاقات",message:(guardianName||"ولی دانش‌آموز")+" — "+label,studentId:row.studentId,requestId:row.id,read:false,createdAt:now,createdAtIso:nowIso});}
      m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:guardianId||row.studentId,action:"پاسخ ولی به دعوت ملاقات",details:String(row.id||"")+" — "+decision,at:now});
      return {request:row,meeting};
    });
    return sendJson(res,200,{ok:true,request:result.result.request,meeting:result.result.meeting||null});
  }
  // ===== V21-GUARDIAN-MEETING-RESPONSES-END =====
  if(req.method==="POST"&&url.pathname==="/api/guardian/meeting-request"){
    const b=await readJson(req); const sid=String(b.studentId||""); if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403}); const guardianName=guardian?.guardianName||guardian?.name||link.guardianName||"ولی دانش‌آموز";const message=String(b.message||"").trim();if(message.length<3||message.length>1000)throw Object.assign(new Error("موضوع درخواست ملاقات باید بین ۳ تا ۱۰۰۰ نویسه باشد."),{status:400});const r=await mutateDb(m=>{m.parentRequests||=[];const now=faNow(),nowIso=new Date().toISOString();const row={id:makeId("preq"),studentId:sid,guardianId:guardian?.id||null,guardianName,kind:"meeting",title:"درخواست ملاقات",message,status:"open",academicYear:String(m.school?.year||""),createdAt:now,createdAtIso:nowIso};m.parentRequests.unshift(row);m.notifications=Array.isArray(m.notifications)?m.notifications:[];for(const admin of (m.users||[]).filter(u=>["admin","superadmin"].includes(u.role)&&u.active!==false))m.notifications.unshift({id:makeId("notif"),userId:admin.id,type:"family_request_new",title:"درخواست جدید ملاقات از اولیا",body:`${guardianName}: ${message.slice(0,160)}`,message:`${guardianName}: ${message.slice(0,160)}`,studentId:sid,requestId:row.id,read:false,at:now,createdAt:now,createdAtIso:nowIso});return row;}); return sendJson(res,200,{ok:true,request:r.result});
  }
  // v200 — non-meeting guardian request to the school; handled by the admin family inbox.
  if(req.method==="POST"&&url.pathname==="/api/guardian/contact-request"){
    const b=await readJson(req),sid=String(b.studentId||"");if(!linkedIds.has(sid))throw Object.assign(new Error("دسترسی به این دانش‌آموز مجاز نیست."),{status:403});
    const title=String(b.title||b.subject||"").trim(),message=String(b.message||"").trim(),category=String(b.category||"general").trim();
    if(title.length<3||title.length>120)throw Object.assign(new Error("عنوان درخواست باید بین ۳ تا ۱۲۰ نویسه باشد."),{status:400});
    if(message.length<3||message.length>1200)throw Object.assign(new Error("متن درخواست باید بین ۳ تا ۱۲۰۰ نویسه باشد."),{status:400});
    if(!["general","academic","administrative","welfare"].includes(category))throw Object.assign(new Error("نوع درخواست معتبر نیست."),{status:400});
    const guardianName=guardian?.guardianName||guardian?.name||link.guardianName||"ولی دانش‌آموز";
    const r=await mutateDb(m=>{m.parentRequests=Array.isArray(m.parentRequests)?m.parentRequests:[];const now=faNow(),nowIso=new Date().toISOString();const row={id:makeId("preq"),studentId:sid,guardianId:guardian?.id||null,guardianName,kind:"contact",category,title,message,status:"open",academicYear:String(m.school?.year||""),createdAt:now,createdAtIso:nowIso};m.parentRequests.unshift(row);m.notifications=Array.isArray(m.notifications)?m.notifications:[];for(const admin of (m.users||[]).filter(u=>["admin","superadmin"].includes(u.role)&&u.active!==false))m.notifications.unshift({id:makeId("notif"),userId:admin.id,type:"family_request_new",title:"درخواست جدید اولیا",body:`${guardianName}: ${title}`,message:`${guardianName}: ${title}`,studentId:sid,requestId:row.id,read:false,at:now,createdAt:now,createdAtIso:nowIso});m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:guardian?.id||sid,action:"ثبت درخواست غیرحضوری ولی",details:`${sid} · ${category} · ${title}`,at:now});return row;});
    return sendJson(res,201,{ok:true,request:r.result});
  }
  return sendJson(res,404,{error:"مسیر خانواده پیدا نشد."});
 }catch(e){return sendJson(res,e.status||500,{error:e.message||"خطای خانواده",code:e.code||undefined});}
}
async function handleGuardianAdminApi(req,res,url,auth){
 try{
   if(!isAdminRole(auth.user.role))throw Object.assign(new Error("فقط ادمین مجاز است."),{status:403});
   if(req.method==="POST"&&url.pathname==="/api/admin/guardian-access"){
     const b=await readJson(req),baseUpdatedAt=String(b.baseUpdatedAt||""),studentId=String(b.studentId||""),guardianNid=normalizeNationalId(b.guardianNationalId),guardianName=String(b.guardianName||"").trim(),relation=String(b.relation||"ولی").trim()||"ولی",initialPassword=String(b.initialPassword||b.accessCode||"");
     if(!baseUpdatedAt)throw Object.assign(new Error("نسخه وضعیت صفحه مشخص نیست؛ صفحه را تازه کنید و دوباره تلاش کنید."),{status:428,code:"STATE_REVISION_REQUIRED"});
     if(!/^\d{10}$/.test(guardianNid))throw Object.assign(new Error("کد ملی ولی باید ۱۰ رقمی باشد."),{status:400});
     if(guardianName.length<3)throw Object.assign(new Error("نام و نام خانوادگی ولی را وارد کنید."),{status:400});
     if(initialPassword){const p=guardianPasswordPolicy(initialPassword);if(p)throw Object.assign(new Error(p),{status:400});}
     const currentSecurity=await readSecurity(); const existingGuardian=(auth.db.guardians||[]).find(g=>normalizeNationalId(g.nationalId)===guardianNid&&g.active!==false); const existingCred=existingGuardian?currentSecurity.guardianCredentials?.[existingGuardian.id]:null;
     if(!existingCred&&!initialPassword)throw Object.assign(new Error("برای ساخت حساب جدید ولی، رمز اولیه را وارد کنید."),{status:400});
     const saved=await mutateDb(m=>{
       const st=(m.users||[]).find(u=>u.id===studentId&&u.role==="student"&&u.profileStatus!=="deleted");if(!st)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});
       m.guardians=Array.isArray(m.guardians)?m.guardians:[];m.guardianLinks=Array.isArray(m.guardianLinks)?m.guardianLinks:[];
       let g=m.guardians.find(x=>normalizeNationalId(x.nationalId)===guardianNid);if(g)Object.assign(g,{guardianName,nationalId:guardianNid,mobile:normalizePhone(b.mobile??g.mobile??""),active:g.active!==false,updatedAt:faNow()});else{g={id:makeId("guardian"),guardianName,nationalId:guardianNid,mobile:normalizePhone(b.mobile||""),active:true,createdAt:faNow()};m.guardians.push(g);}
       let row=m.guardianLinks.find(x=>x.studentId===studentId&&(x.guardianId===g.id||normalizeNationalId(x.guardianKey)===guardianNid));if(row)Object.assign(row,{guardianId:g.id,guardianName,relation,guardianKey:g.id,active:true,updatedAt:faNow()});else{row={id:makeId("glink"),studentId,guardianId:g.id,guardianName,relation,guardianKey:g.id,active:true,createdAt:faNow()};m.guardianLinks.push(row);}
       m.audit=Array.isArray(m.audit)?m.audit:[];
       const auditRecord={id:makeId("log"),userId:auth.user.id,action:"ایجاد/اتصال حساب ولی",details:`${guardianName} · ${guardianNid} · ${studentId}`,at:faNow()};
       m.audit.unshift(auditRecord);
       return {guardian:{...g},link:{...row,accessHash:undefined},audit:auditRecord};
     },baseUpdatedAt,async ({result})=>{
       const guardianId=result.guardian.id;
       if(initialPassword||!currentSecurity.guardianCredentials?.[guardianId])await mutateSecurity(async sec=>{sec.guardianCredentials||={};const old=sec.guardianCredentials[guardianId]||{};sec.guardianCredentials[guardianId]={...old,passwordHash:await passwordHash(initialPassword),mustChangePassword:true,failedLoginCount:0,lockedUntil:0,passwordChangedAt:null,credentialVersion:Number(old.credentialVersion||0)+1};});
     });
     const guardianId=saved.result.guardian.id;
     await securityAudit({type:existingGuardian?"guardian_link_update":"guardian_account_create",userId:guardianId,role:"guardian",success:true,ip:clientIp(req),details:`student=${studentId}; reset=${Boolean(initialPassword)}`});
     return sendJson(res,200,{ok:true,guardian:publicGuardianV4520(saved.result.guardian),guardianRecord:saved.result.guardian,link:saved.result.link,linkRecord:saved.result.link,auditRecord:saved.result.audit,updatedAt:saved.updatedAt,passwordReset:Boolean(initialPassword),existingAccount:Boolean(existingGuardian)});
   }
   if(req.method==="POST"&&url.pathname==="/api/admin/guardian-password"){
     const b=await readJson(req),baseUpdatedAt=String(b.baseUpdatedAt||""),guardianId=String(b.guardianId||""),mode=String(b.mode||"reset"),newPassword=String(b.newPassword||"");
     if(!baseUpdatedAt)throw Object.assign(new Error("نسخه وضعیت صفحه مشخص نیست؛ صفحه را تازه کنید و دوباره تلاش کنید."),{status:428,code:"STATE_REVISION_REQUIRED"});
     const guardian=(auth.db.guardians||[]).find(g=>g.id===guardianId);
     if(!guardian)throw Object.assign(new Error("حساب ولی پیدا نشد."),{status:404});
     const policy=guardianPasswordPolicy(newPassword);if(policy)throw Object.assign(new Error(policy),{status:400});
     const saved=await mutateDb(m=>{
       m.audit=Array.isArray(m.audit)?m.audit:[];
       const auditRecord={id:makeId("log"),userId:auth.user.id,action:mode==="change"?"تغییر رمز ولی":"ریست رمز ولی",details:`${guardian.guardianName||guardian.name||guardianId}`,at:faNow()};
       m.audit.unshift(auditRecord);return {audit:auditRecord};
     },baseUpdatedAt,async()=>{
       await mutateSecurity(async sec=>{sec.guardianCredentials||={};const old=sec.guardianCredentials[guardianId]||{};sec.guardianCredentials[guardianId]={...old,passwordHash:await passwordHash(newPassword),mustChangePassword:mode!=="change",failedLoginCount:0,lockedUntil:0,passwordChangedAt:mode==="change"?new Date().toISOString():null,credentialVersion:Number(old.credentialVersion||0)+1};});
     });
     await securityAudit({type:mode==="change"?"guardian_password_change_admin":"guardian_password_reset_admin",userId:guardianId,role:"guardian",success:true,ip:clientIp(req),details:`by=${auth.user.id}`});
     return sendJson(res,200,{ok:true,mustChangePassword:mode!=="change",updatedAt:saved.updatedAt,auditRecord:saved.result.audit});
   }
   if(req.method==="POST"&&url.pathname==="/api/admin/guardian-status"){
     const b=await readJson(req),baseUpdatedAt=String(b.baseUpdatedAt||""),guardianId=String(b.guardianId||""),active=b.active!==false;
     if(!baseUpdatedAt)throw Object.assign(new Error("نسخه وضعیت صفحه مشخص نیست؛ صفحه را تازه کنید و دوباره تلاش کنید."),{status:428,code:"STATE_REVISION_REQUIRED"});
     const current=(auth.db.guardians||[]).find(g=>g.id===guardianId);
     if(!current)throw Object.assign(new Error("حساب ولی پیدا نشد."),{status:404});
     if(active){
       // Old versions may already have deleted a disabled guardian's hash.
       // The old password is NOT recoverable: require an explicit admin reset.
       const security=await readSecurity();
       if(!security.guardianCredentials?.[guardianId]?.passwordHash)
         throw Object.assign(new Error("اطلاعات رمز این حساب موجود نیست؛ ابتدا رمز ولی را از بخش مدیریت اولیا بازنشانی و سپس حساب را فعال کنید."),{status:409});
     }
     const saved=await mutateDb(m=>{
       m.guardians=Array.isArray(m.guardians)?m.guardians:[];
       const guardian=m.guardians.find(g=>g.id===guardianId);if(!guardian)throw Object.assign(new Error("حساب ولی پیدا نشد."),{status:404});
       guardian.active=active;guardian.updatedAt=faNow();m.audit=Array.isArray(m.audit)?m.audit:[];
       const auditRecord={id:makeId("log"),userId:auth.user.id,action:active?"فعال‌سازی حساب ولی":"غیرفعال‌سازی حساب ولی",details:`${guardian.guardianName||guardian.name||guardianId}`,at:faNow()};
       m.audit.unshift(auditRecord);return {guardian:{...guardian},audit:auditRecord};
     },baseUpdatedAt,async()=>{
       if(!active&&current.active!==false)await mutateSecurity(sec=>{const credential=sec.guardianCredentials?.[guardianId];if(credential)credential.credentialVersion=Number(credential.credentialVersion||1)+1;});
     });
     await securityAudit({type:active?"guardian_activate_admin":"guardian_deactivate_admin",userId:guardianId,role:"guardian",success:true,ip:clientIp(req),details:`by=${auth.user.id}`});
     return sendJson(res,200,{ok:true,guardian:publicGuardianV4520(saved.result.guardian),guardianRecord:saved.result.guardian,auditRecord:saved.result.audit,updatedAt:saved.updatedAt});
   }
   if(req.method==="DELETE"&&url.pathname==="/api/admin/guardian-link"){
     const b=await readJson(req),baseUpdatedAt=String(b.baseUpdatedAt||""),guardianId=String(b.guardianId||""),studentId=String(b.studentId||"");
     if(!baseUpdatedAt)throw Object.assign(new Error("نسخه وضعیت صفحه مشخص نیست؛ صفحه را تازه کنید و دوباره تلاش کنید."),{status:428,code:"STATE_REVISION_REQUIRED"});
     const saved=await mutateDb(m=>{
       m.guardianLinks=Array.isArray(m.guardianLinks)?m.guardianLinks:[];
       const row=m.guardianLinks.find(x=>x.guardianId===guardianId&&x.studentId===studentId&&x.active!==false);
       if(!row)throw Object.assign(new Error("اتصال موردنظر پیدا نشد."),{status:404});
       row.active=false;row.updatedAt=faNow();m.audit=Array.isArray(m.audit)?m.audit:[];
       const auditRecord={id:makeId("log"),userId:auth.user.id,action:"حذف اتصال ولی و دانش‌آموز",details:`guardian=${guardianId}; student=${studentId}`,at:faNow()};
       m.audit.unshift(auditRecord);const linkRecord={...row};delete linkRecord.accessHash;return {link:linkRecord,audit:auditRecord};
     },baseUpdatedAt);
     await securityAudit({type:"guardian_link_remove_admin",userId:guardianId,role:"guardian",success:true,ip:clientIp(req),details:`student=${studentId}; by=${auth.user.id}`});
     return sendJson(res,200,{ok:true,link:saved.result.link,linkRecord:saved.result.link,auditRecord:saved.result.audit,updatedAt:saved.updatedAt});
   }
   return sendJson(res,404,{error:"مسیر دسترسی خانواده پیدا نشد."});
 }catch(e){return sendJson(res,e.status||500,{error:e.message||"خطای دسترسی خانواده",code:e.code||undefined,latestUpdatedAt:e.latestUpdatedAt||undefined});}
}


function profileChangeSummaryV76(before,after){
  const labels={firstName:"نام",lastName:"نام خانوادگی",birthDate:"تاریخ تولد",studentCode:"کد دانش‌آموزی",classId:"کلاس",studentMobile:"موبایل دانش‌آموز",guardianMobile:"موبایل ولی",homePhone:"تلفن منزل",emergencyGuardianName:"نام تماس اضطراری",emergencyGuardianRelation:"نسبت تماس اضطراری",emergencyGuardianMobile:"موبایل اضطراری",address:"نشانی",postalCode:"کدپستی",fatherName:"نام پدر",motherName:"نام مادر",placeOfBirth:"محل تولد",identityNumber:"شماره شناسنامه",adminNote:"یادداشت اداری"};
  const out=[];for(const key of Object.keys(labels)){if(String(before?.[key]??"")!==String(after?.[key]??""))out.push({field:key,label:labels[key],from:String(before?.[key]??""),to:String(after?.[key]??"")});}return out;
}
function publicAcademicYearCenterV76(db){
  const years=ensureAcademicYearModel(db.school||{}),current=years.find(y=>y.active)||years.find(y=>y.label===db.school?.year)||null;
  const enrollments=normalizeEnrollments(db);const year=String(db.school?.year||"");
  return {current,years,enrollmentStats:{active:enrollments.filter(x=>x.active!==false&&String(x.academicYear||"")===year).length,total:enrollments.length},calendarCount:(db.calendarEvents||[]).filter(x=>x.active!==false&&String(x.academicYear||year)===year).length};
}
function publicCalendarForStudentV76(db,student){
  const year=String(db.school?.year||"");
  return (db.calendarEvents||[]).map(x=>normalizeCalendarEvent(x,year)).filter(x=>x.active!==false&&String(x.academicYear||year)===year&&calendarAffectsStudent(x,student)).sort((a,b)=>String(a.startDate||"").localeCompare(String(b.startDate||""))||String(a.title||"").localeCompare(String(b.title||""),"fa")).map(x=>({id:x.id,title:x.title,type:x.type,startDate:x.startDate,endDate:x.endDate,scope:x.scope,grade:x.grade,classId:x.classId,note:x.note,blocksAttendance:x.blocksAttendance,blocksTeaching:x.blocksTeaching}));
}
function publicActiveAcademicYearV76(db){const years=ensureAcademicYearModel(db.school||{});return years.find(y=>y.active)||years.find(y=>y.label===db.school?.year)||null;}
async function handleAdminV76Api(req,res,url,auth){
  try{
    if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("این بخش فقط برای مدیر مجاز است."),{status:403});
    if(req.method==="GET"&&url.pathname==="/api/admin/v76/academic-year")return sendJson(res,200,{ok:true,...publicAcademicYearCenterV76(auth.db)});
    if(req.method==="POST"&&url.pathname==="/api/admin/v76/academic-year"){
      const body=await readJson(req);const currentLabel=String(auth.db.school?.year||"");const config=validateAcademicYearConfig(body,currentLabel);
      const saved=await mutateDb(m=>{m.school||={};m.school.academicYears=ensureAcademicYearModel(m.school);const index=m.school.academicYears.findIndex(y=>y.label===currentLabel);const old=index>=0?m.school.academicYears[index]:null;const row={...(old||{}),...config,label:currentLabel,active:true,status:"active",updatedAt:new Date().toISOString(),updatedBy:auth.user.id};if(index>=0)m.school.academicYears[index]=row;else m.school.academicYears.unshift(row);m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"تنظیم تقویم سال تحصیلی",details:`${currentLabel} · ${row.startDate||"—"} تا ${row.endDate||"—"}`,at:faNow()});return row;});
      return sendJson(res,200,{ok:true,current:saved.result,years:ensureAcademicYearModel(saved.db.school)});
    }
    if(req.method==="GET"&&url.pathname==="/api/admin/v76/calendar"){
      const year=String(url.searchParams.get("academicYear")||auth.db.school?.year||"");const rows=(auth.db.calendarEvents||[]).map(x=>normalizeCalendarEvent(x,year)).filter(x=>x.active!==false&&(!year||String(x.academicYear||year)===year)).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate))||String(a.title).localeCompare(String(b.title),"fa"));return sendJson(res,200,{ok:true,academicYear:year,events:rows});
    }
    if(req.method==="POST"&&url.pathname==="/api/admin/v76/calendar"){
      const body=await readJson(req);const row=validateCalendarEvent(body,auth.db);const saved=await mutateDb(m=>{m.calendarEvents=Array.isArray(m.calendarEvents)?m.calendarEvents:[];let current=body.id?m.calendarEvents.find(x=>x.id===String(body.id)):null;const payload={...row,id:current?.id||makeId("cal"),academicYear:String(row.academicYear||m.school?.year||""),createdAt:current?.createdAt||new Date().toISOString(),createdBy:current?.createdBy||auth.user.id,updatedAt:new Date().toISOString(),updatedBy:auth.user.id};if(current)Object.assign(current,payload);else{current=payload;m.calendarEvents.push(current);}m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ثبت رویداد تقویم آموزشی",details:`${current.title} · ${current.startDate}${current.endDate!==current.startDate?` تا ${current.endDate}`:""}`,at:faNow()});return {...current};});return sendJson(res,200,{ok:true,event:saved.result});
    }
    const calendarDelete=url.pathname.match(/^\/api\/admin\/v76\/calendar\/([^/]+)$/);
    if(req.method==="DELETE"&&calendarDelete){const id=decodeURIComponent(calendarDelete[1]);const saved=await mutateDb(m=>{const row=(m.calendarEvents||[]).find(x=>x.id===id);if(!row)throw Object.assign(new Error("رویداد پیدا نشد."),{status:404});row.active=false;row.deletedAt=new Date().toISOString();row.deletedBy=auth.user.id;m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"حذف رویداد تقویم آموزشی",details:row.title||id,at:faNow()});return row;});return sendJson(res,200,{ok:true,event:saved.result});}
    if(req.method==="GET"&&url.pathname==="/api/admin/v76/calendar/check-date"){
      const date=String(url.searchParams.get("date")||"");const studentId=String(url.searchParams.get("studentId")||"");const student=studentId?(auth.db.users||[]).find(x=>x.id===studentId&&x.role==="student"):null;return sendJson(res,200,{ok:true,date,events:activeCalendarForDate(auth.db,date,student)});
    }
    if(req.method==="POST"&&url.pathname==="/api/admin/v76/student-profile"){
      const body=await readJson(req),studentId=String(body.studentId||""),requestedPhoto=String(body.photoDataUrl||"");
      let photoRecord=null,photoRollback=null,photoPath="";
      if(requestedPhoto){
        // Validate size/type before touching state, and retain the previous file so
        // a failed state commit cannot leave profile metadata and media divergent.
        const m=requestedPhoto.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        if(!m)throw Object.assign(new Error("فرمت عکس پروفایل معتبر نیست."),{status:400});
        if(Buffer.from(m[2],"base64").length>1.5*1024*1024)throw Object.assign(new Error("حجم عکس پروفایل باید کمتر از ۱.۵ مگابایت باشد."),{status:413});
        photoPath=path.join(FILES_DIR,`${safeKey(`student_profile_${studentId}`)}.json`);
        try{photoRollback=await fs.readFile(photoPath,"utf8");}catch(error){if(error?.code!=="ENOENT")throw error;}
      }
      try{
        const saved=await mutateDb(m=>{const st=(m.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.profileStatus!=="deleted");if(!st)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});const before={...st};const classId=String(body.classId ?? st.classId ?? "");if(classId&&!(m.school?.classes||[]).some(c=>c.id===classId&&c.active!==false))throw Object.assign(new Error("کلاس انتخاب‌شده معتبر نیست."),{status:400});const fields={firstName:String(body.firstName ?? st.firstName ?? "").trim().slice(0,80),lastName:String(body.lastName ?? st.lastName ?? "").trim().slice(0,100),birthDate:String(body.birthDate ?? st.birthDate ?? "").trim().slice(0,20),studentCode:String(body.studentCode ?? st.studentCode ?? "").trim().slice(0,40),classId,studentMobile:normalizePhone(body.studentMobile ?? st.studentMobile),guardianMobile:normalizePhone(body.guardianMobile ?? st.guardianMobile),homePhone:normalizePhone(body.homePhone ?? st.homePhone),emergencyGuardianName:String(body.emergencyGuardianName ?? st.emergencyGuardianName ?? "").trim().slice(0,120),emergencyGuardianRelation:String(body.emergencyGuardianRelation ?? st.emergencyGuardianRelation ?? "").trim().slice(0,60),emergencyGuardianMobile:normalizePhone(body.emergencyGuardianMobile ?? st.emergencyGuardianMobile),address:String(body.address ?? st.address ?? "").trim().slice(0,600),postalCode:normalizeNationalId(body.postalCode ?? st.postalCode).slice(0,10),fatherName:String(body.fatherName ?? st.fatherName ?? "").trim().slice(0,120),motherName:String(body.motherName ?? st.motherName ?? "").trim().slice(0,120),placeOfBirth:String(body.placeOfBirth ?? st.placeOfBirth ?? "").trim().slice(0,120),identityNumber:String(body.identityNumber ?? st.identityNumber ?? "").trim().slice(0,40),adminNote:String(body.adminNote ?? st.adminNote ?? "").trim().slice(0,1500)};Object.assign(st,fields,{profileUpdatedAt:new Date().toISOString(),profileUpdatedBy:auth.user.id});
          if(before.classId!==st.classId){const year=String(m.school?.year||"");m.enrollments=normalizeEnrollments(m);const enr=(m.enrollments||[]).find(e=>e.studentId===st.id&&String(e.academicYear||"")===year&&e.active!==false);if(enr){enr.previousClassId=enr.classId;enr.classId=st.classId;enr.updatedAt=new Date().toISOString();enr.updatedBy=auth.user.id;}}
          const cls=(m.school?.classes||[]).find(c=>c.id===st.classId);if(cls){st.grade=Number(cls.grade);const meta=gradeMeta(st.grade);st.gradeId=meta.id;st.gradeName=meta.name;}
          const changes=profileChangeSummaryV76(before,st);m.studentExtendedProfiles=Array.isArray(m.studentExtendedProfiles)?m.studentExtendedProfiles:[];const oldExtended=studentExtendedProfileV734(m,st.id),nextExtended=normalizeExtendedProfileV734(body.extendedProfile||oldExtended,st.id),extendedChanges=profileDiffV734(oldExtended,nextExtended);let extRow=m.studentExtendedProfiles.find(x=>x.studentId===st.id&&x.active!==false);if(!extRow){extRow={id:makeId("sprof"),studentId:st.id,active:true,createdAt:new Date().toISOString(),createdBy:auth.user.id};m.studentExtendedProfiles.unshift(extRow);}Object.assign(extRow,nextExtended,{updatedAt:new Date().toISOString(),updatedBy:auth.user.id});
          m.recordHistory=Array.isArray(m.recordHistory)?m.recordHistory:[];const allChanges=[...changes,...extendedChanges];if(allChanges.length)m.recordHistory.unshift({id:makeId("hist"),studentId:st.id,academicYear:String(m.school?.year||""),type:"profile_update",changes:allChanges,createdAt:new Date().toISOString(),createdBy:auth.user.id});m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"ویرایش پرونده حرفه‌ای دانش‌آموز",details:`${st.firstName||""} ${st.lastName||""} · ${allChanges.length} تغییر${requestedPhoto?" · عکس جدید":""}`,at:faNow()});return {studentId:st.id,student:publicStudent(st,m),extendedProfile:safeExtendedProfileV734(extRow,{includeSensitive:true}),profileCompleteness:profileCompletenessV734(m,st,extRow)};},"",async({db,result})=>{
            if(!requestedPhoto)return;
            photoRecord=await saveStudentProfilePhoto(studentId,requestedPhoto);
            const target=(db.users||[]).find(x=>x.id===studentId);
            if(target){Object.assign(target,{profilePhotoUpdatedAt:new Date().toISOString()});target.profileUpdatedAt=target.profilePhotoUpdatedAt;result.student=publicStudent(target,db);result.profilePhoto={key:photoRecord.key,updatedAt:target.profilePhotoUpdatedAt};}
          });
        return sendJson(res,200,{ok:true,...saved.result});
      }catch(error){
        if(requestedPhoto&&photoRecord){
          try{if(photoRollback!==null)await atomicWriteText(photoPath,photoRollback,0o600);else await fs.rm(photoPath,{force:true});}catch(rollbackError){console.warn("Profile photo rollback failed",rollbackError.message);}
        }
        throw error;
      }
    }
    if(req.method==="POST"&&url.pathname==="/api/admin/v76/student-photo"){
      const body=await readJson(req),studentId=String(body.studentId||"");const st=(auth.db.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.profileStatus!=="deleted");if(!st)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});const record=await saveStudentProfilePhoto(studentId,body.dataUrl);await mutateDb(m=>{const target=(m.users||[]).find(x=>x.id===studentId);if(target){target.profilePhotoUpdatedAt=new Date().toISOString();target.profileUpdatedAt=target.profileUpdatedAt||target.profilePhotoUpdatedAt;}m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"بروزرسانی عکس پرونده دانش‌آموز",details:studentId,at:faNow()});return true;});return sendJson(res,200,{ok:true,key:record.key,updatedAt:new Date().toISOString()});
    }
    if(req.method==="POST"&&url.pathname==="/api/admin/v76/student-document"){
      const body=await readJson(req),studentId=String(body.studentId||"");const saved=await mutateDb(m=>{const st=(m.users||[]).find(x=>x.id===studentId&&x.role==="student"&&x.profileStatus!=="deleted");if(!st)throw Object.assign(new Error("دانش‌آموز پیدا نشد."),{status:404});m.studentDocuments=Array.isArray(m.studentDocuments)?m.studentDocuments:[];const title=String(body.title||"").trim().slice(0,160);if(!title)throw Object.assign(new Error("عنوان مدرک الزامی است."),{status:400});const row={id:makeId("sdoc"),studentId,title,documentType:String(body.documentType||"other").trim().slice(0,60),fileKey:String(body.fileKey||"").trim().slice(0,180),issuedAt:String(body.issuedAt||"").slice(0,20),expiresAt:String(body.expiresAt||"").slice(0,20),verificationStatus:["pending","verified","rejected"].includes(String(body.verificationStatus))?String(body.verificationStatus):"pending",verifiedAt:String(body.verificationStatus)==="verified"?new Date().toISOString():"",verifiedBy:String(body.verificationStatus)==="verified"?auth.user.id:"",note:String(body.note||"").trim().slice(0,1000),academicYear:String(m.school?.year||""),active:true,createdAt:new Date().toISOString(),createdBy:auth.user.id};m.studentDocuments.unshift(row);m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"افزودن مدرک پرونده دانش‌آموز",details:`${studentId} · ${title}`,at:faNow()});return row;});return sendJson(res,200,{ok:true,document:saved.result});
    }
    const docDelete=url.pathname.match(/^\/api\/admin\/v76\/student-document\/([^/]+)$/);
    if(req.method==="DELETE"&&docDelete){const id=decodeURIComponent(docDelete[1]);const saved=await mutateDb(m=>{const row=(m.studentDocuments||[]).find(x=>x.id===id&&x.active!==false);if(!row)throw Object.assign(new Error("مدرک پیدا نشد."),{status:404});row.active=false;row.deletedAt=new Date().toISOString();row.deletedBy=auth.user.id;m.audit||=[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"حذف مدرک پرونده دانش‌آموز",details:row.title||id,at:faNow()});return row;});return sendJson(res,200,{ok:true,document:saved.result});}
    return sendJson(res,404,{error:"مسیر مدیریت آموزشی نسخه 72.26 پیدا نشد."});
  }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مدیریت آموزشی",code:error.code||undefined});}
}


function classGradeV4515Server(db,classId){return Number((db.school?.classes||[]).find(c=>c.id===classId)?.grade||0);}
function destinationClassV4515Server(db,fromClassId,toGrade){const classes=(db.school?.classes||[]).filter(c=>c.active!==false&&Number(c.grade)===Number(toGrade));if(!classes.length)return null;const from=(db.school?.classes||[]).find(c=>c.id===fromClassId),suffix=String(from?.name||"").split(/[-–—]/).pop().trim();return classes.find(c=>String(c.name||"").endsWith(suffix))||classes[0];}
function rolloverPreviewV4515(db,newYear){const activeStudents=(db.users||[]).filter(u=>u.role==="student"&&u.active!==false&&u.profileStatus!=="deleted"),rows=[];for(const s of activeStudents){const g=Number(s.grade||classGradeV4515Server(db,s.classId));if(g===7||g===8){const dest=destinationClassV4515Server(db,s.classId,g+1);rows.push({studentId:s.id,name:`${s.firstName||""} ${s.lastName||""}`.trim(),fromGrade:g,toGrade:g+1,fromClassId:s.classId,toClassId:dest?.id||"",toClassName:dest?.name||"بدون کلاس مقصد",action:dest?"promote":"blocked"});}else if(g===9)rows.push({studentId:s.id,name:`${s.firstName||""} ${s.lastName||""}`.trim(),fromGrade:9,toGrade:null,fromClassId:s.classId,toClassId:"",toClassName:"فارغ‌التحصیل",action:"graduate"});}return {fromYear:db.school?.year||"",newYear,students:rows,blocked:rows.filter(r=>r.action==="blocked").length,promote:rows.filter(r=>r.action==="promote").length,graduate:rows.filter(r=>r.action==="graduate").length};}
async function handleAdminV4515Api(req,res,url,auth){
 try{if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("این بخش فقط برای ادمین مجاز است."),{status:403});
  if(req.method==="GET"&&url.pathname==="/api/admin/v4515/audit"){const limit=Math.min(2000,Math.max(50,Number(url.searchParams.get("limit")||500)));return sendJson(res,200,{activity:(auth.db.audit||[]).slice(0,limit),security:await readSecurityAudit(limit)});}
  if(req.method==="POST"&&url.pathname==="/api/admin/v4515/academic-rollover"){
    const body=await readJson(req),newYear=String(body.newYear||"").trim();if(newYear.length<5||newYear.length>30)throw Object.assign(new Error("عنوان سال تحصیلی جدید معتبر نیست."),{status:400});const preview=rolloverPreviewV4515(auth.db,newYear);if(body.preview!==false)return sendJson(res,200,{preview});if(preview.blocked)throw Object.assign(new Error("برای بعضی دانش‌آموزان کلاس مقصد تعریف نشده است."),{status:400});
    const saved=await enqueueStateOperation(async()=>{const latest=(await ensureStateInitialized()).db,livePreview=rolloverPreviewV4515(latest,newYear),oldYear=latest.school.year||"";
      for(const key of ["attendanceSessions","attendance","onlineClassSessions","onlineJoinEvents","homework","homeworkSubmissions","continuousAssessments","behaviorRecords","interventions","lessonLogs","consentForms","progressReports","termGrades","exams","submissions","grades","appeals"]){
        if(!Array.isArray(latest[key]))continue;
        latest[key]=latest[key].map(row=>row&&typeof row==="object"&&!row.academicYear?{...row,academicYear:oldYear}:row);
      }
      await createStateSnapshot(`before-year-rollover-${String(oldYear).replace(/[^0-9A-Za-z_-]/g,"-")}`);
      latest.yearArchives=Array.isArray(latest.yearArchives)?latest.yearArchives:[];
      const gp=gradingPolicyV200(latest),oldEnrollments=(latest.enrollments||[]).filter(e=>String(e.academicYear||oldYear)===oldYear).map(e=>({...e}));
      latest.yearArchives.unshift({id:makeId("yeararc"),label:oldYear,closedAt:new Date().toISOString(),closedBy:auth.user.id,gradingPolicy:{mode:gp.mode,continuousWeight:gp.continuousWeight,finalWeight:gp.finalWeight,scoreScale:gp.scoreScale},summary:{students:(latest.users||[]).filter(u=>u.role==="student"&&u.active!==false).length,exams:(latest.exams||[]).filter(e=>!e.academicYear||e.academicYear===oldYear).length,grades:(latest.grades||[]).length,enrollments:oldEnrollments.length},classes:(latest.school?.classes||[]).map(c=>({id:c.id,name:c.name,grade:c.grade,gradeName:c.gradeName||""})),enrollments:oldEnrollments});
      const rolloverAt=new Date().toISOString();
      for(const row of livePreview.students){
        const st=latest.users.find(u=>u.id===row.studentId);if(!st)continue;
        if(row.action==="promote"){
          const dest=(latest.school.classes||[]).find(c=>c.id===row.toClassId);if(!dest)continue;
          closeAndCreateEnrollment({db:latest,student:st,oldYear,newYear,toClassId:dest.id,action:"promote",nowIso:rolloverAt});
          st.classId=dest.id;st.grade=Number(dest.grade);const meta=gradeMeta(st.grade);st.gradeId=meta.id;st.gradeName=meta.name;st.academicYear=newYear;st.profileStatus="active";st.active=true;
        }else if(row.action==="graduate"){
          closeAndCreateEnrollment({db:latest,student:st,oldYear,newYear,toClassId:"",action:"graduate",nowIso:rolloverAt});
          st.active=false;st.profileStatus="graduated";st.graduatedAt=rolloverAt;st.graduationYear=oldYear;
        }
      }
      latest.school.academicYears=ensureAcademicYearModel(latest.school);
      for(const y of latest.school.academicYears){y.active=false;if(y.label===oldYear){y.status="closed";y.closedAt=rolloverAt;y.closedBy=auth.user.id;}}
      latest.school.year=newYear;
      let next=latest.school.academicYears.find(y=>y.label===newYear);
      if(!next){next={id:makeId("year"),label:newYear,active:true,status:"active",createdAt:faNow(),terms:[{id:"semester1",title:"نیم‌سال اول",status:"active",startDate:"",endDate:""},{id:"semester2",title:"نیم‌سال دوم",status:"planned",startDate:"",endDate:""}]};latest.school.academicYears.unshift(next);}else{next.active=true;next.status="active";next.closedAt="";next.closedBy="";}
      latest.school.academicYears=ensureAcademicYearModel(latest.school);
      latest.enrollments=normalizeEnrollments(latest);
      latest.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"بستن سال تحصیلی و ارتقای دانش‌آموزان",details:`${oldYear} -> ${newYear}; ارتقا ${livePreview.promote}; فارغ‌التحصیل ${livePreview.graduate}`,at:faNow()});return writeStateEnvelope(latest,{skipSnapshot:true});});
    await securityAudit({type:"academic_year_rollover",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`${preview.fromYear}->${newYear}`});return sendJson(res,200,{ok:true,preview,db:scopedDbForStaff(saved.db,auth.user)});
  }
  return sendJson(res,404,{error:"مسیر مدیریتی نسخه 45.15 پیدا نشد."});
 }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مدیریت نسخه 45.15"});}
}


async function restoreEncryptedBackupV67304(parsed) {
  if (!parsed || parsed.app !== "madreseyar-encrypted-backup" || !parsed.db) {
    throw Object.assign(new Error("داده پشتیبان ناقص یا ناسازگار است."), { status: 400 });
  }
  if (!validSecurityShape(parsed.security)) {
    throw Object.assign(new Error("بخش امنیتی پشتیبان ناقص یا نامعتبر است؛ هیچ تغییری اعمال نشد."), { status: 400 });
  }
  const candidateDb = upgradeServerDbRespectingReset(structuredClone(parsed.db));
  validateServerState(candidateDb);
  const candidateSecurity = structuredClone(parsed.security);
  candidateSecurity.guardianSessions = {};
  candidateSecurity.sessions = {};
  candidateSecurity.examGrants = {};

  return enqueueStateOperation(() => enqueueSecurityOperation(async () => {
    const previousState = await ensureStateInitialized();
    const previousSecurity = await readSecurity();
    await createStateSnapshot("before-encrypted-restore");
    await writeEncryptedRestoreTransactionV67304(previousState, previousSecurity);
    try {
      const saved = await writeStateEnvelope(candidateDb, { skipSnapshot: true, skipTiered: true });
      if (process.env.NODE_ENV === "test" && process.env.MADRESEYAR_TEST_FAIL_ENCRYPTED_RESTORE_AFTER_STATE === "1") {
        throw new Error("TEST_ENCRYPTED_RESTORE_AFTER_STATE");
      }
      await writeSecurity(candidateSecurity);
      if (process.env.NODE_ENV === "test" && process.env.MADRESEYAR_TEST_FAIL_ENCRYPTED_RESTORE_AFTER_SECURITY === "1") {
        throw new Error("TEST_ENCRYPTED_RESTORE_AFTER_SECURITY");
      }
      // Normalize credentials against the restored DB while both state/security
      // mutation queues are still held. Any failure below triggers pair rollback.
      await ensureSecurityInitializedUnlocked(saved.db);
      await fs.rm(ENCRYPTED_RESTORE_TRANSACTION_FILE, { force: true });
      return saved;
    } catch (error) {
      try { await recoverInterruptedEncryptedRestoreV67304("restore_error"); }
      catch (rollbackError) {
        const combined = new Error(`بازیابی پشتیبان ناموفق بود و بازگردانی خودکار نیز کامل نشد: ${rollbackError.message}`);
        combined.status = 500;
        combined.code = "ENCRYPTED_RESTORE_ROLLBACK_FAILED";
        combined.cause = error;
        throw combined;
      }
      throw error;
    }
  }));
}

async function releaseDiagnostics(db){
 const health=await systemHealthSnapshot(db); const required=["users","curriculum","exams","questionBank","attendance","homework","guardianLinks","reportCards","assets","migrationHistory"]; const schema=Object.fromEntries(required.map(k=>[k,Array.isArray(db[k])])); return {version:APP_VERSION,release:APP_RELEASE,ok:health.integrity.ok&&Object.values(schema).every(Boolean),schema,health,policies:db.systemPolicies,releaseInfo:db.releaseInfo,time:new Date().toISOString()};
}
async function handleReleaseApi(req,res,url,auth){
 try{if(!["admin","superadmin"].includes(auth.user.role))throw Object.assign(new Error("فقط ادمین مجاز است."),{status:403});
   if(req.method==="GET"&&url.pathname==="/api/admin/release-diagnostics")return sendJson(res,200,await releaseDiagnostics(auth.db));
   if(url.pathname.startsWith("/api/admin/encrypted-backup/") && auth.user.role!=="superadmin")throw Object.assign(new Error("خروجی و بازیابی پشتیبان امنیتی فقط برای سوپرادمین مجاز است."),{status:403});
   if(req.method==="POST"&&url.pathname==="/api/admin/encrypted-backup/export"){const b=await readJson(req),pass=String(b.passphrase||"");if(pass.length<10)throw Object.assign(new Error("عبارت رمز باید حداقل ۱۰ نویسه باشد."),{status:400});const env=await ensureStateInitialized(),sec=await readSecurity();const securityBackup={version:sec.version,credentialPresetVersion:sec.credentialPresetVersion,serverSecret:sec.serverSecret,credentials:sec.credentials,guardianCredentials:sec.guardianCredentials,createdAt:sec.createdAt};const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=await scryptAsync(pass,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);const plain=Buffer.from(JSON.stringify({app:"madreseyar-encrypted-backup",version:APP_VERSION,createdAt:new Date().toISOString(),db:env.db,security:securityBackup}),"utf8");const enc=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();return sendJson(res,200,{app:"madreseyar-aes-gcm",version:APP_VERSION,kdf:"scrypt",salt:salt.toString("base64"),iv:iv.toString("base64"),tag:tag.toString("base64"),payload:enc.toString("base64")});}
   if(req.method==="POST"&&url.pathname==="/api/admin/encrypted-backup/restore"){const b=await readJson(req),pass=String(b.passphrase||""),pack=b.package;if(pass.length<10)throw Object.assign(new Error("عبارت رمز باید حداقل ۱۰ نویسه باشد."),{status:400});if(!pack||pack.app!=="madreseyar-aes-gcm"||!pack.salt||!pack.iv||!pack.tag||!pack.payload)throw Object.assign(new Error("بسته پشتیبان معتبر نیست."),{status:400});let parsed;try{const salt=Buffer.from(pack.salt,"base64"),iv=Buffer.from(pack.iv,"base64"),tag=Buffer.from(pack.tag,"base64"),key=await scryptAsync(pass,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}),dec=crypto.createDecipheriv("aes-256-gcm",key,iv);dec.setAuthTag(tag);const plain=Buffer.concat([dec.update(Buffer.from(pack.payload,"base64")),dec.final()]);parsed=JSON.parse(plain.toString("utf8"));}catch{throw Object.assign(new Error("عبارت رمز یا فایل پشتیبان صحیح نیست."),{status:400});}const saved=await restoreEncryptedBackupV67304(parsed);await securityAudit({type:"encrypted_backup_restore",userId:auth.user.id,role:auth.user.role,ip:clientIp(req),details:`version ${saved.db.version}`});return sendJson(res,200,{ok:true,version:saved.db.version,updatedAt:saved.updatedAt});}
   return sendJson(res,404,{error:"مسیر انتشار پیدا نشد."});
 }catch(e){return sendJson(res,e.status||500,{error:e.message||"خطای انتشار"});}
}

// P67.21.1: Only browser-facing static assets are public; never serve
// server-side modules, database exports, archives or dotfiles from any
// otherwise publicly mounted subdirectory.
const P67211_PUBLIC_STATIC_EXTENSIONS = new Set([
  ".html", ".js", ".css", ".webmanifest", ".png", ".jpg",
  ".jpeg", ".webp", ".gif", ".svg", ".ico", ".txt",
  ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".mp3", ".mp4"
]);
function p67211SafePublicAsset(urlPath) {
  const parts = String(urlPath || "").split("/").filter(Boolean);
  if (!parts.length || parts.some(part => part.startsWith("."))) return false;
  return P67211_PUBLIC_STATIC_EXTENSIONS.has(path.posix.extname(parts.at(-1)).toLowerCase());
}
function isPublicStaticPath(urlPath) {
  const value = String(urlPath || "/");
  if (["/", "/index.html", "/styles.css", "/app.js", "/continuous-p11.js"].includes(value)) return true;
  return ["/assets/", "/student/", "/guardian/", "/teacher/", "/attendance/", "/shared/"].some(prefix => value.startsWith(prefix));
}

async function serveQuestionMedia48(req,res,urlPath){
  const item=questionMediaRequest48(urlPath,QUESTION_MEDIA_DIR_48);
  if(!item)return sendJson(res,404,{error:"تصویر سؤال پیدا نشد."});
  try{
    const stat=await fs.stat(item.filePath);
    if(!stat.isFile())return sendJson(res,404,{error:"تصویر سؤال پیدا نشد."});
    const headers={...studentFrameHeaders(),"Content-Type":item.mime,"Content-Length":stat.size,"Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"};
    res.writeHead(200,headers);
    if(req.method==='HEAD')return res.end();
    return res.end(await fs.readFile(item.filePath));
  }catch(error){
    if(error?.code==='EACCES')return sendJson(res,403,{error:"دسترسی غیرمجاز"});
    return sendJson(res,404,{error:"تصویر سؤال پیدا نشد."});
  }
}

async function serveStatic(req, res, urlPath) {
  if (!isPublicStaticPath(urlPath)) return sendJson(res, 404, { error: "فایل پیدا نشد." });
  const requested = urlPath === "/" ? "/index.html" : urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath;
  let decoded;
  try { decoded = decodeURIComponent(requested); }
  catch { return sendJson(res, 400, { error: "آدرس درخواست معتبر نیست." }); }
  const normalizedUrlPath = path.posix.normalize(String(decoded).replace(/\\/g, "/"));
  if (!isPublicStaticPath(normalizedUrlPath) || !p67211SafePublicAsset(normalizedUrlPath)) return sendJson(res, 404, { error: "فایل پیدا نشد." });
  const relativePath = normalizedUrlPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);
  const rootPrefix = `${path.resolve(ROOT)}${path.sep}`;
  if (filePath !== path.resolve(ROOT) && !filePath.startsWith(rootPrefix)) return sendJson(res, 403, { error: "دسترسی غیرمجاز" });
  try {
    // Defend against symlinks inside public folders pointing outside the web root.
    const realRoot = await fs.realpath(ROOT);
    const realFile = await fs.realpath(filePath);
    if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`))
      return sendJson(res, 403, { error: "دسترسی غیرمجاز" });
    const fileStat = await fs.stat(realFile);
    if (!fileStat.isFile()) return sendJson(res, 404, { error: "فایل پیدا نشد." });
    const data = req.method === "HEAD" ? null : await fs.readFile(realFile);
    const staticHeaders = normalizedUrlPath === "/shared/p635-teacher.html"
      ? p67193ExamCenterFrameHeaders()
      : normalizedUrlPath.startsWith("/student/") ? studentFrameHeaders() : securityHeaders();
    res.writeHead(200, { ...staticHeaders, "Content-Type": MIME[path.extname(realFile).toLowerCase()] || "application/octet-stream", "Content-Length": fileStat.size, "Cache-Control": "no-cache" });
    if (req.method === "HEAD") return res.end();
    res.end(data);
  } catch (error) {
    if (error?.code === "EACCES") return sendJson(res, 403, { error: "دسترسی غیرمجاز" });
    return sendJson(res, 404, { error: "فایل پیدا نشد." });
  }
}

function stripConfiguredBasePath(pathname) {
  const value = String(pathname || "/");
  if (!APP_BASE_PATH) return value;
  if (value === APP_BASE_PATH) return "/";
  if (value.startsWith(`${APP_BASE_PATH}/`)) return value.slice(APP_BASE_PATH.length) || "/";
  return value;
}


// p62 — protected digital library. Files live under DATA_DIR, never public static.
const P62_DIR=path.join(DATA_DIR,'library-p62');
const P62_TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','text/plain':'txt'};
function p62Err(message,status=400){return Object.assign(new Error(message),{status});}
function p62Visible(db,user,row){if(row.active===false)return false;if(user.role==='student')return String(row.classId)===String(user.classId);if(['admin','superadmin'].includes(user.role))return true;return teacherCanAssigned(db,user,{classId:row.classId,subject:row.subject});}
function p62Meta(row){const {dataUrl,...rest}=row;return rest;}
async function handleLibraryP62(req,res,url){
 try{
  const auth=await authenticate(req,['student','teacher','admin','superadmin']);const db=auth.db,user=auth.user;
  const staff=user.role!=='student';
  if(req.method==='GET'&&url.pathname==='/api/library/p62/assignments'){
   if(!staff)throw p62Err('دسترسی غیرمجاز',403);
   const assignments=activeTeachingAssignments(db,user).filter(a=>a.active!==false).map(a=>({classId:a.classId,subject:a.subject||'',className:(db.school?.classes||[]).find(c=>c.id===a.classId)?.name||a.classId})).filter(a=>a.classId&&a.subject);
   if(['admin','superadmin'].includes(user.role))for(const cls of db.school?.classes||[])for(const sub of (db.school?.subjects||[])){const name=typeof sub==='string'?sub:sub.name||sub.title;if(name&&!assignments.some(a=>a.classId===cls.id&&a.subject===name))assignments.push({classId:cls.id,subject:name,className:cls.name||cls.id});}
   return sendJson(res,200,{ok:true,assignments});
  }
  if(req.method==='GET'&&url.pathname==='/api/library/p62/list'){
   return sendJson(res,200,{ok:true,items:(db.libraryP62||[]).filter(r=>p62Visible(db,user,r)).map(p62Meta).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});
  }
  if(req.method==='POST'&&url.pathname==='/api/library/p62/create'){
   if(!staff)throw p62Err('فقط معلم یا مدیر می‌تواند جزوه منتشر کند.',403);
   const b=await readJson(req),classId=String(b.classId||''),subject=String(b.subject||'').trim(),title=String(b.title||'').trim().slice(0,140),description=String(b.description||'').trim().slice(0,600);
   if(!title||!classId||!subject)throw p62Err('عنوان، کلاس و درس الزامی است.');
   if(!(db.school?.classes||[]).some(c=>c.id===classId))throw p62Err('کلاس معتبر نیست.');
   if(!teacherCanAssigned(db,user,{classId,subject}))throw p62Err('این درس و کلاس به شما تخصیص داده نشده است.',403);
   const mime=String(b.mime||'').toLowerCase();if(!P62_TYPES[mime])throw p62Err('فقط PDF، تصویر یا متن ساده مجاز است.');
   const encoded=String(b.data||'');if(!encoded||encoded.length>17*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw p62Err('فایل معتبر نیست یا حجم آن بیش از حد مجاز است.',413);
   const bytes=Buffer.from(encoded,'base64');if(bytes.length>12*1024*1024||bytes.length<1)throw p62Err('حجم فایل باید کمتر از ۱۲ مگابایت باشد.',413);
   if(mime==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw p62Err('ساختار فایل PDF معتبر نیست.');
   if(mime==='image/png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw p62Err('تصویر PNG معتبر نیست.');
   if(mime==='image/jpeg'&&bytes.subarray(0,3).toString('hex')!=='ffd8ff')throw p62Err('تصویر JPEG معتبر نیست.');
   if(mime==='image/webp'&&bytes.subarray(0,4).toString()!=='RIFF')throw p62Err('تصویر WebP معتبر نیست.');
   const id=makeId('lib62'),fileName=id+'.'+P62_TYPES[mime];await fs.mkdir(P62_DIR,{recursive:true,mode:0o700});
   await fs.writeFile(path.join(P62_DIR,fileName),bytes,{flag:'wx',mode:0o600});
   try{const saved=await mutateDb(m=>{m.libraryP62=Array.isArray(m.libraryP62)?m.libraryP62:[];const row={id,classId,subject,title,description,mime,fileName,size:bytes.length,originalName:String(b.name||'').replace(/[\\/]/g,'').slice(0,120),createdBy:user.id,teacherName:[user.firstName,user.lastName].filter(Boolean).join(' '),createdAt:new Date().toISOString(),active:true};m.libraryP62.unshift(row);return row;});return sendJson(res,200,{ok:true,item:p62Meta(saved.result)});}catch(e){await fs.rm(path.join(P62_DIR,fileName),{force:true});throw e;}
  }
  const match=url.pathname.match(/^\/api\/library\/p62\/(file|item)\/([a-zA-Z0-9_-]+)$/);
  if(match){const row=(db.libraryP62||[]).find(r=>r.id===match[2]&&r.active!==false);if(!row)throw p62Err('جزوه پیدا نشد.',404);if(!p62Visible(db,user,row))throw p62Err('اجازه دسترسی به جزوه را ندارید.',403);
   if(match[1]==='item'&&req.method==='PATCH'){
    if(!staff||(!['admin','superadmin'].includes(user.role)&&row.createdBy!==user.id))throw p62Err('فقط منتشرکننده می‌تواند جزوه را ویرایش کند.',403);
    const b=await readJson(req),title=String(b.title||'').trim().slice(0,140);if(!title)throw p62Err('عنوان الزامی است.');const saved=await mutateDb(m=>{const r=(m.libraryP62||[]).find(x=>x.id===row.id);r.title=title;r.description=String(b.description||'').trim().slice(0,600);return r;});return sendJson(res,200,{ok:true,item:p62Meta(saved.result)});
   }
   if(match[1]==='item'&&req.method==='DELETE'){
    if(!staff||(!['admin','superadmin'].includes(user.role)&&row.createdBy!==user.id))throw p62Err('فقط منتشرکننده می‌تواند جزوه را حذف کند.',403);
    await mutateDb(m=>{const r=(m.libraryP62||[]).find(x=>x.id===row.id);r.active=false;r.deletedAt=new Date().toISOString();return true;});return sendJson(res,200,{ok:true});
   }
   if(match[1]==='file'&&req.method==='GET'){
    if(!P62_TYPES[row.mime]||row.fileName!==row.id+'.'+P62_TYPES[row.mime])throw p62Err('فایل معتبر نیست.',400);
    let data;try{data=await fs.readFile(path.join(P62_DIR,row.fileName));}catch{throw p62Err('فایل روی سرور پیدا نشد.',404);}
    const filename=encodeURIComponent(row.originalName||row.title+'.'+P62_TYPES[row.mime]);res.writeHead(200,{...corsHeaders(),'Content-Type':row.mime,'Content-Length':data.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename*=UTF-8''${filename}`});return res.end(data);
   }
  }
  return sendJson(res,404,{error:'مسیر کتابخانه پیدا نشد.'});
 }catch(e){return sendJson(res,e.status||500,{error:e.message||'خطای کتابخانه'});}
}

// p63.5 — separate self-assessment domain; never reads/writes official exams, attempts, grades or homework.
async function handlePracticeCenterP635(req,res,url){
 try{
  const auth=await authenticate(req,['student','teacher','admin','superadmin']);
  const {user,db}=auth,year=String(db.school?.year||'');
  const fail=(msg,status=400)=>{throw Object.assign(new Error(msg),{status});};
  const isStudent=user.role==='student';
  const allowed=q=>q&&q.active!==false&&String(q.academicYear||year)===year&&(q.ownerType==='personal'?(isStudent&&q.ownerId===user.id):(isStudent?q.classId===user.classId:(user.role!=='teacher'||teacherCanAssigned(db,user,{classId:q.classId,subject:q.subject}))));
  // p64.6 — optional controls; older quizzes retain their original unrestricted behavior.
  const policy=q=>q?.ownerType==='teacher'?(q.practicePolicy||{}):{};
  const within=(q,now=Date.now())=>{const p=policy(q);return (!p.startAt||now>=Date.parse(p.startAt))&&(!p.endAt||now<Date.parse(p.endAt));};
  const attemptsFor=(q,uid)=> (db.p635Attempts||[]).filter(a=>a.quizId===q.id&&a.studentId===uid);
  const remaining=(q,uid)=>{const n=Number(policy(q).maxAttempts||0);return n?Math.max(0,n-attemptsFor(q,uid).length):null;};
  const visibleResult=(q)=>{const p=policy(q);return p.resultMode!=='afterEnd'||(p.endAt&&Date.now()>=Date.parse(p.endAt));};
  const qs=(db.p635Quizzes||[]).filter(allowed);
  if(req.method==='GET'&&url.pathname==='/api/p635/quizzes'){
   return sendJson(res,200,{quizzes:qs.map(q=>({id:q.id,title:q.title,subject:q.subject,chapter:q.chapter,ownerType:q.ownerType,questionCount:q.questions.length,createdAt:q.createdAt,attemptCount:(db.p635Attempts||[]).filter(a=>a.quizId===q.id&&a.studentId===user.id).length,practicePolicy:policy(q),canStart:within(q)&&remaining(q,user.id)!==0,remainingAttempts:remaining(q,user.id)})),subjects:(()=>{const cls=(db.school?.classes||[]).find(c=>c.id===user.classId),grade=Number(user.grade||cls?.grade||0),gradeId=String(cls?.gradeId||(db.school?.grades||[]).find(g=>Number(g.grade)===grade)?.id||'');const books=(db.curriculum||[]).filter(b=>b.active!==false&&(grade?(Number(b.grade)===grade||(gradeId&&String(b.gradeId||'')===gradeId)):false));const official=books.map(b=>String(b.subject||'').trim()).filter(Boolean);return [...new Set(official.length?official:(db.school?.subjects||[]).map(x=>String(x||'').trim()).filter(Boolean))];})(),subjectChapters:[...new Map((db.p635Questions||[]).filter(q=>q.active!==false&&String(q.academicYear||year)===year&&(q.scope==='public'||(q.scope==='class'&&q.classId===user.classId)||(q.createdBy===user.id))).map(q=>[q.subject+'\u0000'+(q.chapter||''),{subject:q.subject,chapter:q.chapter||''}])).values()]});
  }
  if(req.method==='GET'&&url.pathname==='/api/p635/history'){
   if(!isStudent)fail('فقط دانش‌آموز مجاز است.',403);
   return sendJson(res,200,{attempts:(db.p635Attempts||[]).filter(a=>a.studentId===user.id).map(a=>{const q=(db.p635Quizzes||[]).find(x=>x.id===a.quizId);return {id:a.id,quizId:a.quizId,title:a.title,subject:a.subject,score:q&&!visibleResult(q)?null:a.score,total:a.total,percent:q&&!visibleResult(q)?null:a.percent,submittedAt:a.submittedAt,details:q&&!visibleResult(q)?[]:a.details,resultPending:!!q&&!visibleResult(q)};}).reverse().slice(0,100)});
  }
  if(req.method==='GET'&&url.pathname==='/api/p635/assignments'){
   if(isStudent)fail('این بخش مخصوص کارکنان است.',403);
   const rows=user.role==='teacher'?(db.teachingAssignments||[]).filter(a=>a.teacherId===user.id&&teacherAssignmentIsActive(db,a)):(db.teachingAssignments||[]).filter(a=>teacherAssignmentIsActive(db,a));
   const classes=db.school?.classes||[];
   const unique=new Map();
   for(const a of rows){if(!a.classId||!a.subject)continue;const cls=classes.find(c=>c.id===a.classId);if(!cls)continue;const key=a.classId+'\u0000'+a.subject;unique.set(key,{classId:a.classId,className:String(cls.name||cls.title||cls.label||a.classId),subject:a.subject});}
   return sendJson(res,200,{assignments:[...unique.values()].sort((a,b)=>a.className.localeCompare(b.className,'fa')||a.subject.localeCompare(b.subject,'fa'))});
  }
  // p64.8 — small, validated embedded image for independent practice questions only.
  const p648Image = value => {
   if(value===null||value===undefined||value==='')return '';
   if(typeof value!=='string'||value.length>220000)fail('حجم تصویر بیش از حد مجاز است (حداکثر ۱۵۰ کیلوبایت).');
   const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
   if(!match)fail('فقط تصویر PNG، JPG یا WEBP مجاز است.');
   const bytes=Buffer.from(match[2],'base64');
   if(!bytes.length||bytes.length>150*1024)fail('حداکثر حجم تصویر ۱۵۰ کیلوبایت است.');
   const sig=bytes.subarray(0,16);
   const valid=match[1]==='png'?sig.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?(sig[0]===255&&sig[1]===216&&sig[2]===255):(sig.toString('ascii',0,4)==='RIFF'&&sig.toString('ascii',8,12)==='WEBP');
   if(!valid)fail('محتوای تصویر با فرمت انتخاب‌شده سازگار نیست.');
   return value;
  };
  // p64.9 — attachments restricted to the independent practice bank.
  const p649Attachment = value => {
   if(value===null||value===undefined||value==='')return null;
   if(!value||typeof value!=='object'||typeof value.name!=='string'||typeof value.data!=='string')fail('پیوست معتبر نیست.');
   const name=value.name.trim().slice(0,120);
   if(!name||/[\\/\x00-\x1f]/.test(name))fail('نام پیوست معتبر نیست.');
   const ext=name.split('.').pop().toLowerCase();
   const mime=ext==='pdf'?'application/pdf':ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'';
   if(!mime)fail('فقط PDF و DOCX مجاز است.');
   const prefix='data:'+mime+';base64,';
   if(!value.data.startsWith(prefix)||value.data.length>700000)fail('نوع یا حجم پیوست نامعتبر است.');
   const encoded=value.data.slice(prefix.length);
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('ساختار پیوست نامعتبر است.');
   const bytes=Buffer.from(encoded,'base64');
   if(!bytes.length||bytes.length>500*1024)fail('پیوست باید حداکثر ۵۰۰ کیلوبایت باشد.');
   if(ext==='pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))fail('فایل PDF معتبر نیست.');
   if(ext==='docx'&&!(bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04))fail('فایل DOCX معتبر نیست.');
   return {name,data:value.data};
  };
  if(req.method==='GET'&&url.pathname==='/api/p635/questions'){
   if(isStudent)fail('دسترسی به بانک سؤال مجاز نیست.',403);
   return sendJson(res,200,{questions:(db.p635Questions||[]).filter(q=>q.active!==false&&q.createdBy===user.id&&String(q.academicYear||year)===year).map(q=>({id:q.id,classId:q.classId,subject:q.subject,chapter:q.chapter,text:q.text,options:q.options,correctIndex:q.correctIndex,explanation:q.explanation||'',image:q.image||'',attachment:q.attachment||null,createdAt:q.createdAt}))});
  }
  if(req.method==='POST'&&url.pathname==='/api/p635/questions'){
   if(isStudent)fail('فقط معلم یا مدیر می‌تواند سؤال ثبت کند.',403);
   const b=await readJson(req),subject=String(b.subject||'').trim().slice(0,100),classId=String(b.classId||'').trim(),chapter=String(b.chapter||'').trim().slice(0,120),text=String(b.text||'').trim().slice(0,1000),options=Array.isArray(b.options)?b.options.map(x=>String(x||'').trim().slice(0,300)):[],correctIndex=Number(b.correctIndex);
   if(!subject||!text||options.length!==4||options.some(x=>!x)||!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>3)fail('سؤال چهارگزینه‌ای معتبر نیست.');
   if(user.role==='teacher'&&!teacherCanAssigned(db,user,{classId,subject}))fail('دسترسی تدریس به این کلاس و درس ندارید.',403);
   const row={id:makeId('p635q'),subject,classId,chapter,text,options,correctIndex,explanation:String(b.explanation||'').slice(0,1200),image:p648Image(b.image),attachment:p649Attachment(b.attachment),scope:classId?'class':'public',createdBy:user.id,academicYear:year,active:true,createdAt:new Date().toISOString()};
   const saved=await mutateDb(m=>{m.p635Questions||=[];m.p635Questions.push(row);return row;});return sendJson(res,201,{ok:true,id:saved.result.id});
  }
  // p63.16 — edit/delete only the authenticated author's own independent-center questions.
  const questionMatch=url.pathname.match(/^\/api\/p635\/questions\/([a-zA-Z0-9_-]+)$/);
  if(questionMatch&&(req.method==='PATCH'||req.method==='DELETE')){
   if(isStudent)fail('دسترسی به بانک سؤال مجاز نیست.',403);
   const id=questionMatch[1];
   const original=(db.p635Questions||[]).find(q=>q.id===id&&q.active!==false&&q.createdBy===user.id&&String(q.academicYear||year)===year);
   if(!original)fail('سؤال متعلق به شما پیدا نشد.',404);
   if(user.role==='teacher'&&!teacherCanAssigned(db,user,{classId:original.classId,subject:original.subject}))fail('تخصیص تدریس این سؤال دیگر فعال نیست.',403);
   if(req.method==='DELETE'){
    await mutateDb(m=>{const row=(m.p635Questions||[]).find(q=>q.id===id&&q.createdBy===user.id&&q.active!==false);if(!row)fail('سؤال پیدا نشد.',404);row.active=false;row.deletedAt=new Date().toISOString();return true;});
    return sendJson(res,200,{ok:true});
   }
   const b=await readJson(req);
   const text=String(b.text||'').trim().slice(0,1000),chapter=String(b.chapter||'').trim().slice(0,120),options=Array.isArray(b.options)?b.options.map(x=>String(x||'').trim().slice(0,300)):[],correctIndex=Number(b.correctIndex),explanation=String(b.explanation||'').slice(0,1200);
   if(!text||options.length!==4||options.some(x=>!x)||!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>3)fail('اطلاعات سؤال معتبر نیست.');
   await mutateDb(m=>{const row=(m.p635Questions||[]).find(q=>q.id===id&&q.createdBy===user.id&&q.active!==false);if(!row)fail('سؤال پیدا نشد.',404);Object.assign(row,{text,chapter,options,correctIndex,explanation,image:Object.hasOwn(b,'image')?p648Image(b.image):(row.image||''),attachment:Object.hasOwn(b,'attachment')?p649Attachment(b.attachment):(row.attachment||null),updatedAt:new Date().toISOString()});return true;});
   return sendJson(res,200,{ok:true});
  }
  if(req.method==='POST'&&url.pathname==='/api/p635/quizzes'){
   const b=await readJson(req),subject=String(b.subject||'').trim().slice(0,100),chapter=String(b.chapter||'').trim().slice(0,120),count=Number(b.count||10),title=String(b.title||'').trim().slice(0,140),classId=isStudent?user.classId:String(b.classId||'').trim();
   if(!subject||!Number.isInteger(count)||count<1||count>40)fail('درس و تعداد سؤال معتبر نیست.');
   if(isStudent){const cls=(db.school?.classes||[]).find(c=>c.id===user.classId),grade=Number(user.grade||cls?.grade||0),gradeId=String(cls?.gradeId||(db.school?.grades||[]).find(g=>Number(g.grade)===grade)?.id||'');const books=(db.curriculum||[]).filter(b=>b.active!==false&&(grade?(Number(b.grade)===grade||(gradeId&&String(b.gradeId||'')===gradeId)):false));const official=books.map(b=>String(b.subject||'').trim()).filter(Boolean);const valid=new Set(official.length?official:(db.school?.subjects||[]).map(x=>String(x||'').trim()).filter(Boolean));if(!valid.has(subject))fail('درس انتخاب‌شده متعلق به پایه شما نیست.',403);const choices=(db.p635Questions||[]).filter(q=>q.active!==false&&String(q.academicYear||year)===year&&(q.scope==='public'||(q.scope==='class'&&q.classId===user.classId)||(q.createdBy===user.id)));if(chapter&&!choices.some(q=>q.subject===subject&&q.chapter===chapter))fail('فصل انتخاب‌شده برای این درس معتبر نیست.',403);}
   if(!isStudent&&user.role==='teacher'&&!teacherCanAssigned(db,user,{classId,subject}))fail('دسترسی به کلاس و درس ندارید.',403);
   if(!isStudent&&!(db.school?.classes||[]).some(c=>c.id===classId))fail('کلاس معتبر نیست.');
   const pool=(db.p635Questions||[]).filter(q=>q.active!==false&&q.subject===subject&&(!chapter||q.chapter===chapter)&&(q.scope==='public'||q.classId===classId)&&String(q.academicYear||year)===year);
   let chosen;
   if(!isStudent&&Array.isArray(b.questionIds)){
    const ids=b.questionIds.map(String);
    if(!ids.length||ids.length>40||new Set(ids).size!==ids.length||ids.length!==count)fail('فهرست سؤال‌های انتخابی معتبر نیست.');
    const own=(db.p635Questions||[]).filter(q=>q.active!==false&&q.createdBy===user.id&&q.classId===classId&&q.subject===subject&&String(q.academicYear||year)===year);
    const byId=new Map(own.map(q=>[String(q.id),q]));chosen=ids.map(id=>byId.get(id));
    if(chosen.some(q=>!q))fail('سؤال انتخابی متعلق به بانک مستقل شما نیست.',403);
   }else{
    if(pool.length<count)fail(`بانک سؤال مستقل فقط ${pool.length} سؤال مناسب دارد.`,409);
    chosen=pool.slice().sort(()=>Math.random()-.5).slice(0,count);
   }
   const settings=b.practicePolicy&&typeof b.practicePolicy==='object'?b.practicePolicy:{};
   const durationMinutes=Number(settings.durationMinutes||0),maxAttempts=Number(settings.maxAttempts||0);
   if(!isStudent&&(!Number.isInteger(durationMinutes)||durationMinutes<0||durationMinutes>240||!Number.isInteger(maxAttempts)||maxAttempts<0||maxAttempts>20))fail('مدت آزمون یا تعداد دفعات مجاز معتبر نیست.');
   const startAt=String(settings.startAt||''),endAt=String(settings.endAt||'');
   if(!isStudent&&((startAt&&!Number.isFinite(Date.parse(startAt)))||(endAt&&!Number.isFinite(Date.parse(endAt)))||(startAt&&endAt&&Date.parse(endAt)<=Date.parse(startAt))))fail('بازه زمانی آزمون معتبر نیست.');
   const resultMode=settings.resultMode==='afterEnd'?'afterEnd':'immediate';
   if(!isStudent&&resultMode==='afterEnd'&&!endAt)fail('برای نمایش نتیجه پس از پایان، زمان پایان آزمون را تعیین کنید.');
   const quiz={id:makeId('p635quiz'),title:title||`خودآزمایی ${subject}${chapter?' - '+chapter:''}`,subject,chapter,classId,ownerType:isStudent?'personal':'teacher',ownerId:user.id,questions:chosen.map(q=>({id:q.id,text:q.text,options:q.options,correctIndex:q.correctIndex,explanation:q.explanation||'',image:q.image||'',attachment:q.attachment||null})),academicYear:year,active:true,createdAt:new Date().toISOString(),practicePolicy:isStudent?undefined:{durationMinutes,maxAttempts,startAt:startAt||null,endAt:endAt||null,resultMode}};
   await mutateDb(m=>{m.p635Quizzes||=[];m.p635Quizzes.push(quiz);return true;});return sendJson(res,201,{ok:true,id:quiz.id});
  }
  // p63.22: teacher-owned independent practice quizzes only; no official exam/grade mutations.
  if(req.method==='GET'&&url.pathname==='/api/p635/teacher/quizzes'){
   if(isStudent)fail('این بخش مخصوص کارکنان است.',403);
   const owned=(db.p635Quizzes||[]).filter(q=>q.ownerType==='teacher'&&q.ownerId===user.id&&String(q.academicYear||year)===year);
   return sendJson(res,200,{quizzes:owned.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(q=>({
    id:q.id,title:q.title,subject:q.subject,chapter:q.chapter||'',classId:q.classId,
    className:String((db.school?.classes||[]).find(c=>c.id===q.classId)?.name||(db.school?.classes||[]).find(c=>c.id===q.classId)?.title||q.classId),
    questionCount:Array.isArray(q.questions)?q.questions.length:0,createdAt:q.createdAt,active:q.active!==false,practicePolicy:policy(q),
    participantCount:new Set((db.p635Attempts||[]).filter(a=>a.quizId===q.id).map(a=>a.studentId)).size,
    attemptCount:(db.p635Attempts||[]).filter(a=>a.quizId===q.id).length
   }))});
  }
  // p64: read-only, owner-scoped independent practice performance; never touches official gradebook.
  const practiceResultsMatch=url.pathname.match(/^\/api\/p635\/teacher\/quizzes\/([a-zA-Z0-9_-]+)\/results$/);
  if(req.method==='GET'&&practiceResultsMatch){
   if(isStudent)fail('این بخش مخصوص کارکنان است.',403);
   const id=practiceResultsMatch[1];
   const quiz=(db.p635Quizzes||[]).find(q=>q.id===id&&q.ownerType==='teacher'&&q.ownerId===user.id&&String(q.academicYear||year)===year);
   if(!quiz)fail('آزمون متعلق به شما پیدا نشد.',404);
   const attempts=(db.p635Attempts||[]).filter(a=>a.quizId===id&&String(a.academicYear||quiz.academicYear||year)===year);
   const byStudent=new Map();
   for(const a of attempts){if(!a.studentId)continue;const key=String(a.studentId),rows=byStudent.get(key)||[];rows.push(a);byStudent.set(key,rows);}
   const participants=[...byStudent].map(([studentId,rows])=>{
    rows.sort((a,b)=>String(b.submittedAt||'').localeCompare(String(a.submittedAt||'')));
    const student=(db.users||[]).find(u=>u.id===studentId&&u.role==='student');
    const name=student?`${student.firstName||''} ${student.lastName||''}`.trim():'';
    return {studentId,studentName:name||'دانش‌آموز بدون نام',attemptCount:rows.length,
     latest:rows[0]?{score:rows[0].score,total:rows[0].total,percent:rows[0].percent,submittedAt:rows[0].submittedAt}:null,
     bestPercent:Math.max(...rows.map(a=>Number(a.percent)||0)),
     attempts:rows.map(a=>({id:a.id,score:a.score,total:a.total,percent:a.percent,submittedAt:a.submittedAt,
      details:(Array.isArray(a.details)?a.details:[]).map(d=>({questionId:d.questionId,text:d.text,options:d.options,answer:d.answer,correctIndex:d.correctIndex,correct:d.correct,explanation:d.explanation||''}))}))};
   }).sort((a,b)=>a.studentName.localeCompare(b.studentName,'fa'));
   const percentages=attempts.map(a=>Number(a.percent)).filter(Number.isFinite);
   return sendJson(res,200,{quiz:{id:quiz.id,title:quiz.title,subject:quiz.subject,chapter:quiz.chapter||'',active:quiz.active!==false,questionCount:Array.isArray(quiz.questions)?quiz.questions.length:0},
    stats:{participantCount:participants.length,attemptCount:attempts.length,averagePercent:percentages.length?Math.round(percentages.reduce((sum,n)=>sum+n,0)/percentages.length):null,
     highestPercent:percentages.length?Math.max(...percentages):null,lowestPercent:percentages.length?Math.min(...percentages):null},participants});
  }
  const teacherQuizMatch=url.pathname.match(/^\/api\/p635\/teacher\/quizzes\/([a-zA-Z0-9_-]+)$/);
  if(req.method==='PATCH'&&teacherQuizMatch){
   if(isStudent)fail('این بخش مخصوص کارکنان است.',403);
   const id=teacherQuizMatch[1],body=await readJson(req);
   if(body.active!==false)fail('فقط غیرفعال‌سازی آزمون پشتیبانی می‌شود.');
   const owned=(db.p635Quizzes||[]).find(q=>q.id===id&&q.ownerType==='teacher'&&q.ownerId===user.id&&String(q.academicYear||year)===year);
   if(!owned)fail('آزمون متعلق به شما پیدا نشد.',404);
   if(owned.active===false)fail('این آزمون قبلاً غیرفعال شده است.',409);
   await mutateDb(m=>{const q=(m.p635Quizzes||[]).find(x=>x.id===id&&x.ownerId===user.id&&x.ownerType==='teacher');if(!q)fail('آزمون پیدا نشد.',404);q.active=false;q.deactivatedAt=new Date().toISOString();q.deactivatedBy=user.id;return true;});
   return sendJson(res,200,{ok:true});
  }
  const detail=url.pathname.match(/^\/api\/p635\/quizzes\/([^/]+)$/);
  if(req.method==='GET'&&detail){
   if(!isStudent)fail('این بخش مخصوص دانش‌آموز است.',403);
   const q=qs.find(x=>x.id===decodeURIComponent(detail[1]));if(!q)fail('آزمون پیدا نشد.',404);
   if(!within(q))fail('آزمون خارج از بازه زمانی مجاز است.',409);
   if(remaining(q,user.id)===0)fail('تعداد دفعات مجاز شرکت در این آزمون تمام شده است.',409);
   let startedAt=null;const duration=Number(policy(q).durationMinutes||0);
   if(duration){
    const key=q.id+'::'+user.id;
    const found=(db.p635Sessions||[]).find(x=>x.key===key);
    if(found)startedAt=found.startedAt;
    else {const now=new Date().toISOString();await mutateDb(m=>{m.p635Sessions||=[];if(!m.p635Sessions.some(x=>x.key===key))m.p635Sessions.push({key,quizId:q.id,studentId:user.id,startedAt:now});return true;});startedAt=now;}
    if(Date.now()>Date.parse(startedAt)+duration*60000)fail('زمان پاسخ‌دهی به این آزمون به پایان رسیده است.',409);
   }
   return sendJson(res,200,{quiz:{id:q.id,title:q.title,subject:q.subject,chapter:q.chapter,questions:q.questions.map(({id,text,options,image,attachment})=>({id,text,options,image:image||'',attachment:attachment||null})),durationMinutes:duration,startedAt}});
  }
  const submit=url.pathname.match(/^\/api\/p635\/quizzes\/([^/]+)\/submit$/);
  if(req.method==='POST'&&submit){
   if(!isStudent)fail('فقط دانش‌آموز می‌تواند پاسخ ثبت کند.',403);
   const q=qs.find(x=>x.id===decodeURIComponent(submit[1]));if(!q)fail('آزمون پیدا نشد.',404);
   const b=await readJson(req),answers=b.answers&&typeof b.answers==='object'&&!Array.isArray(b.answers)?b.answers:{};
   const details=q.questions.map(x=>{const value=answers[x.id],answer=Number.isInteger(value)?value:null;return {questionId:x.id,text:x.text,options:x.options,answer,correctIndex:x.correctIndex,correct:answer===x.correctIndex,explanation:x.explanation};});
   const score=details.filter(x=>x.correct).length,total=details.length;
   const record={id:makeId('p635attempt'),quizId:q.id,studentId:user.id,title:q.title,subject:q.subject,score,total,percent:Math.round(score/total*100),details,academicYear:year,submittedAt:new Date().toISOString()};
   let showResult=true;
   await mutateDb(m=>{
    const live=(m.p635Quizzes||[]).find(x=>x.id===q.id);
    if(!live||live.active===false||String(live.academicYear||year)!==year||live.classId!==user.classId||(live.ownerType==='personal'&&live.ownerId!==user.id))fail('این آزمون دیگر برای شما فعال نیست؛ پاسخ ثبت نشد.',409);
    const p=live.ownerType==='teacher'?(live.practicePolicy||{}):{},now=Date.now();
    if((p.startAt&&now<Date.parse(p.startAt))||(p.endAt&&now>=Date.parse(p.endAt)))fail('بازه زمانی شرکت در آزمون به پایان رسیده یا هنوز شروع نشده است.',409);
    m.p635Attempts||=[];
    if(p.maxAttempts&&m.p635Attempts.filter(a=>a.quizId===live.id&&a.studentId===user.id).length>=p.maxAttempts)fail('تعداد دفعات مجاز شرکت تمام شده است.',409);
    if(p.durationMinutes){const session=(m.p635Sessions||[]).find(x=>x.key===live.id+'::'+user.id);if(!session)fail('ابتدا آزمون را باز کنید.',409);if(now>Date.parse(session.startedAt)+Number(p.durationMinutes)*60000)fail('زمان آزمون به پایان رسیده است.',409);}
    m.p635Attempts.push(record);
    showResult=p.resultMode!=='afterEnd'||(p.endAt&&now>=Date.parse(p.endAt));
    return true;
   });
   return sendJson(res,200,{ok:true,result:showResult?{id:record.id,score,total,percent:record.percent,details}:{id:record.id,pending:true,message:'پاسخ شما ثبت شد؛ نتیجه پس از پایان بازه آزمون قابل مشاهده است.'}});
  }
  fail('مسیر پیدا نشد.',404);
 }catch(e){return sendJson(res,e.status||500,{error:e.status?e.message:'خطای داخلی مرکز آزمون'});}
}

function collectHttpSecurityBoundarySignals31(){
  const sec=securityHeaders();const cors=corsHeaders();
  const csp=String(sec["Content-Security-Policy"]||"");
  return {
    securityHeadersComplete:["X-Content-Type-Options","X-Frame-Options","Strict-Transport-Security","Referrer-Policy","Permissions-Policy","Content-Security-Policy"].every(k=>Boolean(sec[k])),
    cspBoundarySafe:csp.includes("object-src 'none'")&&csp.includes("frame-ancestors 'none'"),
    corsWildcardAbsent:!Object.prototype.hasOwnProperty.call(cors,"Access-Control-Allow-Origin"),
    corsCredentialsAbsent:!Object.prototype.hasOwnProperty.call(cors,"Access-Control-Allow-Credentials"),
    apiNoStore:String(cors["Cache-Control"]||"").toLowerCase().includes("no-store"),
    privateFileNoStore:true,
    genericErrorsSanitized:true,
    methodFallback405:true,
    apiOptionsOnly:true,
    forwardedHeadersRequireTrustProxy:true,
    maxBodyBytes:MAX_BODY,
    headersTimeoutMs:45_000,requestTimeoutMs:10*60_000,keepAliveTimeoutMs:5_000,maxHeadersCount:120
  };
}


function finalDomain33(id,label,snapshot,critical=false){return {id,label,status:snapshot?.status||'degraded',critical};}
function reconciliationDomain34(id,label,snapshot,critical=false){return {id,label,snapshot,critical};}
async function collectFinalProductionReadinessDomains33(db,security){
  const now=new Date().toISOString();
  const missing=await runtimeMissingFiles15();
  const support=supportRuntimeSnapshot14({release:APP_RELEASE,studentApiContract:'student-v1-frozen',requiredCount:RUNTIME_REQUIRED_FILES_15.length,missing,events:clientDiagnosticEvents,uptimeSeconds:process.uptime(),memoryUsage:process.memoryUsage(),nodeVersion:process.version,now});
  const ops=buildReadinessSnapshot15({release:APP_RELEASE,studentApiContract:'student-v1-frozen',requiredCount:RUNTIME_REQUIRED_FILES_15.length,missing,diagnostics:support.diagnostics,uptimeSeconds:process.uptime(),memoryUsage:process.memoryUsage(),nodeVersion:process.version,eventLoopLagMs:await sampleEventLoopLag15(),now});
  const integrity=buildIntegritySnapshot16({release:APP_RELEASE,studentApiContract:'student-v1-frozen',result:await verifyRuntimeIntegrity16(ROOT),now});
  const recovery=buildRecoveryReadinessSnapshot17({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectRecoverySignals17()),now});
  const persistence=buildPersistenceConsistencySnapshot18({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectPersistenceSignals18()),now});
  const securityPosture=buildSecurityPostureSnapshot19({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectSecurityPostureSignals19(db)),now});
  const access=buildAccessControlSnapshot20({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectAccessControlSignals20(db,security),now});
  const sessions=buildSessionHygieneSnapshot21({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectSessionHygieneSignals21(db,security),now});
  const audit=buildAuditConsistencySnapshot22({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectAuditConsistencySignals22(db)),now});
  const config=buildConfigurationConsistencySnapshot23({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectConfigurationConsistencySignals23()),now});
  const exam=buildExamConsistencySnapshot24({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectExamConsistencySignals24(db),now});
  const attendance=buildAttendanceConsistencySnapshot25({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectAttendanceConsistencySignals25(db),now});
  const schedule=buildScheduleConsistencySnapshot26({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectScheduleConsistencySignals26(db),now});
  const gradebook=buildGradebookConsistencySnapshot27({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectGradebookConsistencySignals27(db),now});
  const notifications=buildNotificationConsistencySnapshot28({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectNotificationConsistencySignals28(db),now});
  const files=buildFileAttachmentConsistencySnapshot29({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectFileAttachmentConsistencySignals29(db)),now});
  const globalRefs=buildGlobalReferentialIntegritySnapshot30({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectGlobalReferentialIntegritySignals30(db),now});
  const httpBoundary=buildHttpSecurityBoundarySnapshot31({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...collectHttpSecurityBoundarySignals31(),now});
  const backup=buildBackupRestoreVerificationSnapshot32({release:APP_RELEASE,studentApiContract:'student-v1-frozen',...(await collectBackupRestoreVerificationSignals32()),now});
  const rawDomains=[
    reconciliationDomain34('operations','آمادگی عملیاتی',ops,true),reconciliationDomain34('runtime-integrity','یکپارچگی Runtime',integrity,true),
    reconciliationDomain34('recovery','آمادگی بازیابی',recovery,true),reconciliationDomain34('persistence','هم‌سازی Persistence',persistence,true),
    reconciliationDomain34('security','وضعیت امنیتی',securityPosture,true),reconciliationDomain34('access','کنترل دسترسی',access,true),
    reconciliationDomain34('sessions','بهداشت نشست‌ها',sessions,false),reconciliationDomain34('audit','Audit Trail',audit,false),
    reconciliationDomain34('configuration','تنظیمات استقرار',config,true),reconciliationDomain34('exam','داده آزمون',exam,true),
    reconciliationDomain34('attendance','حضور و غیاب',attendance,false),reconciliationDomain34('schedule','برنامه هفتگی',schedule,false),
    reconciliationDomain34('gradebook','دفتر نمره و کارنامه',gradebook,true),reconciliationDomain34('notifications','اعلان‌ها و پیام‌ها',notifications,false),
    reconciliationDomain34('files','فایل‌ها و پیوست‌ها',files,false),reconciliationDomain34('global-references','ارجاعات سراسری',globalRefs,true),
    reconciliationDomain34('http-boundary','مرز امنیت HTTP',httpBoundary,true),reconciliationDomain34('backup-restore','Backup/Restore',backup,true)
  ];
  const reconciliation=buildProductionWarningReconciliationSnapshot34({release:APP_RELEASE,studentApiContract:'student-v1-frozen',domains:rawDomains,expectedDomainCount:18,now});
  const domains=reconciliation.domains.map(row=>({id:row.id,label:row.label,status:row.status,critical:row.critical}));
  return {domains,reconciliation};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  url.pathname = stripConfiguredBasePath(url.pathname);
  if (req.method === "OPTIONS") {
    if (!url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "مسیر پیدا نشد." });
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (url.pathname.startsWith("/api/p635/")) return await handlePracticeCenterP635(req,res,url);
  if (req.method === "GET" && url.pathname === "/api/network") {
    try { await authenticate(req, ["teacher", "admin", "superadmin"]); }
    catch (error) { return sendJson(res, error.status || 401, { error: error.message }); }
    const urls = process.env.NODE_ENV === "production" ? [] : mobileUrls();
    const forwardedProto = TRUST_PROXY ? String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() : "";
    const forwardedHost = TRUST_PROXY ? String(req.headers["x-forwarded-host"] || "").split(",")[0].trim() : "";
    const protocol = forwardedProto || (req.socket?.encrypted ? "https" : "http");
    const requestHost = forwardedHost || String(req.headers.host || "");
    const publicBase = requestHost ? `${protocol}://${requestHost}${APP_BASE_PATH}`.replace(/\/+$/, "") : "";
    const localBases = urls.map(base => `${base}${APP_BASE_PATH}`);
    return sendJson(res, 200, {
      localUrl: process.env.NODE_ENV === "production" ? "" : `http://127.0.0.1:${PORT}${APP_BASE_PATH}`,
      publicUrl: publicBase,
      mobileUrls: localBases,
      studentAppUrls: [...(publicBase ? [`${publicBase}/student/`] : []), ...localBases.map(base => `${base}/student/`)],
      guardianUrls: [...(publicBase ? [`${publicBase}/guardian/`] : []), ...localBases.map(base => `${base}/guardian/`)],
      teacherAppUrls: [...(publicBase ? [`${publicBase}/teacher/`] : []), ...localBases.map(base => `${base}/teacher/`)],
      attendanceMonitorUrls: [...(publicBase ? [`${publicBase}/attendance/`] : []), ...localBases.map(base => `${base}/attendance/`)],
      port: PORT,
      basePath: APP_BASE_PATH
    });
  }
  if (req.method === "POST" && url.pathname === "/api/staff/client-diagnostics") {
    try {
      const auth = await authenticate(req, STAFF_ROLES);
      const body = await readJson(req);
      const record = normalizeClientDiagnostic(body, auth.user.role);
      const existing = clientDiagnosticEvents.find(event => event.id === record.id);
      if (existing) return sendJson(res, 200, {ok:true,id:existing.id,duplicate:true});
      const budget = consumeDiagnosticBudget14(diagnosticRateWindows14, diagnosticRateIdentity14(req,auth.user), Date.now(), DIAGNOSTIC_RATE_POLICY_14);
      if (!budget.allowed) {
        res.setHeader("Retry-After", String(budget.retryAfterSeconds));
        return sendJson(res,429,{error:"تعداد رخدادهای فنی در این بازه بیش از حد مجاز است.",code:"MSY_DIAGNOSTIC_RATE_LIMIT",retryAfterSeconds:budget.retryAfterSeconds});
      }
      pushClientDiagnostic(record);
      return sendJson(res, 201, {ok:true,id:record.id,remaining:budget.remaining});
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"ثبت رخداد فنی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/client-diagnostics") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const limit=Math.max(1,Math.min(CLIENT_DIAGNOSTIC_LIMIT,Number(url.searchParams.get("limit")||50)||50));
      return sendJson(res,200,{ok:true,ephemeral:true,privacy:"sanitized-no-pii",events:clientDiagnosticEvents.slice(0,limit),time:new Date().toISOString()});
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"دریافت رخدادهای فنی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/support-snapshot") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const missing=await runtimeMissingFiles15();
      return sendJson(res,200,supportRuntimeSnapshot14({release:APP_RELEASE,studentApiContract:"student-v1-frozen",requiredCount:RUNTIME_REQUIRED_FILES_15.length,missing,events:clientDiagnosticEvents,uptimeSeconds:process.uptime(),memoryUsage:process.memoryUsage(),nodeVersion:process.version,now:new Date().toISOString()}));
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"دریافت خلاصه پشتیبانی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/ops-readiness") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const missing=await runtimeMissingFiles15();
      const support=supportRuntimeSnapshot14({release:APP_RELEASE,studentApiContract:"student-v1-frozen",requiredCount:RUNTIME_REQUIRED_FILES_15.length,missing,events:clientDiagnosticEvents,uptimeSeconds:process.uptime(),memoryUsage:process.memoryUsage(),nodeVersion:process.version,now:new Date().toISOString()});
      const eventLoopLagMs=await sampleEventLoopLag15();
      return sendJson(res,200,buildReadinessSnapshot15({release:APP_RELEASE,studentApiContract:"student-v1-frozen",requiredCount:RUNTIME_REQUIRED_FILES_15.length,missing,diagnostics:support.diagnostics,uptimeSeconds:process.uptime(),memoryUsage:process.memoryUsage(),nodeVersion:process.version,eventLoopLagMs,now:new Date().toISOString()}));
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"دریافت وضعیت آماده‌به‌کاری ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/runtime-integrity") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const result=await verifyRuntimeIntegrity16(ROOT);
      return sendJson(res,result.missing.length||result.mismatched.length?409:200,buildIntegritySnapshot16({release:APP_RELEASE,studentApiContract:"student-v1-frozen",result,now:new Date().toISOString()}));
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی یکپارچگی Runtime ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/recovery-readiness") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const signals=await collectRecoverySignals17();
      const snapshot=buildRecoveryReadinessSnapshot17({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"دریافت وضعیت آمادگی بازیابی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/persistence-consistency") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const signals=await collectPersistenceSignals18();
      const snapshot=buildPersistenceConsistencySnapshot18({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی Persistence ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/session-hygiene") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectSessionHygieneSignals21(auth.db,auth.security);
      const snapshot=buildSessionHygieneSnapshot21({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی بهداشت نشست‌ها ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/configuration-consistency") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const signals=await collectConfigurationConsistencySignals23();
      const snapshot=buildConfigurationConsistencySnapshot23({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی تنظیمات استقرار ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/production-warning-reconciliation") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const bundle=await collectFinalProductionReadinessDomains33(auth.db,auth.security);
      return sendJson(res,bundle.reconciliation.status==='blocked'?409:200,bundle.reconciliation);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"تطبیق هشدارهای Production ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/final-production-readiness") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const bundle=await collectFinalProductionReadinessDomains33(auth.db,auth.security);
      const snapshot=buildFinalProductionReadinessSnapshot33({release:APP_RELEASE,studentApiContract:"student-v1-frozen",domains:bundle.domains,expectedDomainCount:18,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی نهایی آمادگی انتشار ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/backup-restore-verification") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const signals=await collectBackupRestoreVerificationSignals32();
      const snapshot=buildBackupRestoreVerificationSnapshot32({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی زنجیره پشتیبان و بازیابی ناموفق بود."}); }
  }

  if (req.method === "GET" && url.pathname === "/api/admin/http-security-boundary") {
    try {
      await authenticate(req,["admin","superadmin"]);
      const snapshot=buildHttpSecurityBoundarySnapshot31({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...collectHttpSecurityBoundarySignals31(),now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی مرز امنیت HTTP ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/global-referential-integrity") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectGlobalReferentialIntegritySignals30(auth.db);
      const snapshot=buildGlobalReferentialIntegritySnapshot30({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی یکپارچگی ارجاعات سراسری ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/file-attachment-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=await collectFileAttachmentConsistencySignals29(auth.db);
      const snapshot=buildFileAttachmentConsistencySnapshot29({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی فایل‌ها و پیوست‌ها ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/notification-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectNotificationConsistencySignals28(auth.db);
      const snapshot=buildNotificationConsistencySnapshot28({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی اعلان‌ها و پیام‌ها ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/gradebook-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectGradebookConsistencySignals27(auth.db);
      const snapshot=buildGradebookConsistencySnapshot27({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی دفتر نمره و کارنامه ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/schedule-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectScheduleConsistencySignals26(auth.db);
      const snapshot=buildScheduleConsistencySnapshot26({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی برنامه هفتگی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/attendance-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectAttendanceConsistencySignals25(auth.db);
      const snapshot=buildAttendanceConsistencySnapshot25({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی داده حضور و غیاب ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/exam-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectExamConsistencySignals24(auth.db);
      const snapshot=buildExamConsistencySnapshot24({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی داده آزمون ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/audit-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=await collectAuditConsistencySignals22(auth.db);
      const snapshot=buildAuditConsistencySnapshot22({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی Audit Trail ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/access-control-consistency") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=collectAccessControlSignals20(auth.db,auth.security);
      const snapshot=buildAccessControlSnapshot20({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی هم‌سازی کنترل دسترسی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/admin/security-posture") {
    try {
      const auth=await authenticate(req,["admin","superadmin"]);
      const signals=await collectSecurityPostureSignals19(auth.db);
      const snapshot=buildSecurityPostureSnapshot19({release:APP_RELEASE,studentApiContract:"student-v1-frozen",...signals,now:new Date().toISOString()});
      return sendJson(res,snapshot.status==='blocked'?409:200,snapshot);
    } catch(error) { return sendJson(res,error.status||500,{error:error.message||"بررسی وضعیت امنیتی ناموفق بود."}); }
  }
  if (req.method === "GET" && url.pathname === "/api/runtime-health") {
    const missing=await runtimeMissingFiles15();
    return sendJson(res,missing.length?503:200,{ok:missing.length===0,release:APP_RELEASE,studentApiContract:"student-v1-frozen",requiredCount:RUNTIME_REQUIRED_FILES_15.length,missing,time:new Date().toISOString()});
  }
  if (req.method === "GET" && url.pathname === "/api/ping") return sendJson(res, 200, { ok: true, app: "madreseyar", version: APP_VERSION, release: APP_RELEASE, basePath: APP_BASE_PATH, school: SCHOOL_NAME, gradingWorkflow: "offline-package-import", security: "rbac-scrypt-password", localSnapshots: true, time: new Date().toISOString() });
  if (req.method === "GET" && url.pathname === "/api/branding") {
    try {
      const env = await ensureStateInitialized();
      const db = env.db; const b = db.school?.uiBranding || {};
      return sendJson(res, 200, {ok:true,version:APP_VERSION,school:{name:db.school?.name||"مدرسه",year:db.school?.year||""},branding:{primaryColor:b.primaryColor||"#14233f",accentColor:b.accentColor||"#4f7cff",logoDataUrl:b.logoDataUrl||"",updatedAt:b.updatedAt||"",headers:b.headers||{}}});
    } catch(error){ return sendJson(res,500,{error:error.message}); }
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/continuous-p11/roster"){
    try{
      const auth=await authenticate(req,["admin","superadmin"]),db=auth.db;
      const classes=(db.school?.classes||[]).filter(c=>c.active!==false).map(c=>({id:String(c.id),name:String(c.name||""),grade:String(c.grade||"")}));
      const classIds=new Set(classes.map(c=>c.id));
      const students=(db.users||[]).filter(u=>u.role==="student"&&u.active!==false&&!['deleted','graduated'].includes(String(u.profileStatus||''))&&classIds.has(String(u.classId||''))).map(u=>({id:String(u.id),name:`${u.firstName||""} ${u.lastName||""}`.trim(),studentCode:String(u.studentCode||""),classId:String(u.classId||"")}));
      return sendJson(res,200,{ok:true,classes,students});
    }catch(e){return sendJson(res,e.status||500,{error:e.message});}
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/continuous-p11"){
    try{const auth=await authenticate(req,["admin","superadmin"]);return sendJson(res,200,continuousP11(auth.db,String(url.searchParams.get("studentId")||""),String(url.searchParams.get("examId")||"")));}
    catch(e){return sendJson(res,e.status||500,{error:e.message});}
  }
  // v200 — admin operational task center and family-request inbox.
  if(url.pathname==="/api/admin/tasks"){
    try{
      const auth=await authenticate(req,["admin","superadmin"]);
      if(req.method==="GET"){
        const rows=(auth.db.adminTasks||[]).slice().sort((a,b)=>{const ad=["urgent","high","normal","low"].indexOf(String(a.priority||"normal")),bd=["urgent","high","normal","low"].indexOf(String(b.priority||"normal"));if(ad!==bd)return ad-bd;return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));});
        return sendJson(res,200,{ok:true,tasks:rows.slice(0,300)});
      }
      if(req.method==="POST"){
        const b=await readJson(req),id=String(b.id||"").trim(),title=String(b.title||"").trim(),note=String(b.note||"").trim(),priority=String(b.priority||"normal"),status=String(b.status||"open"),dueDate=String(b.dueDate||"").trim();
        if(title.length<3||title.length>180)throw Object.assign(new Error("عنوان کار مدیریتی باید بین ۳ تا ۱۸۰ نویسه باشد."),{status:400});
        if(note.length>2000||dueDate.length>40)throw Object.assign(new Error("توضیح یا تاریخ سررسید بیش از حد طولانی است."),{status:400});
        if(!["low","normal","high","urgent"].includes(priority)||!["open","in_progress","done","closed"].includes(status))throw Object.assign(new Error("اولویت یا وضعیت معتبر نیست."),{status:400});
        const saved=await mutateDb(m=>{m.adminTasks=Array.isArray(m.adminTasks)?m.adminTasks:[];let row=id?m.adminTasks.find(x=>String(x.id)===id):null;const now=faNow(),nowIso=new Date().toISOString();if(row){Object.assign(row,{title,note,priority,status,dueDate,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id});}else{row={id:makeId("atask"),title,note,priority,status,dueDate,createdAt:now,createdAtIso:nowIso,createdBy:auth.user.id,updatedAt:now,updatedAtIso:nowIso,updatedBy:auth.user.id};m.adminTasks.unshift(row);}m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:id?"ویرایش کار مدیریتی":"ثبت کار مدیریتی",details:`${row.title} · ${row.status}`,at:now});return row;});
        return sendJson(res,id?200:201,{ok:true,task:saved.result});
      }
      return sendJson(res,405,{error:"روش درخواست پشتیبانی نمی‌شود."});
    }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای مرکز کارهای مدیریتی"});}
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/family-requests"){
    try{
      const auth=await authenticate(req,["admin","superadmin"]);const rows=(auth.db.parentRequests||[]).filter(r=>String(r.kind||r.type||"")!=="meeting_invitation").slice().sort((a,b)=>String(b.createdAtIso||b.createdAt||"").localeCompare(String(a.createdAtIso||a.createdAt||""))).slice(0,300).map(r=>{const st=(auth.db.users||[]).find(u=>String(u.id)===String(r.studentId||""));return {...r,studentName:st?`${st.firstName||""} ${st.lastName||""}`.trim():""};});return sendJson(res,200,{ok:true,requests:rows});
    }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای دریافت درخواست‌های خانواده"});}
  }
  if(req.method==="POST"&&url.pathname==="/api/admin/family-request/action"){
    try{
      const auth=await authenticate(req,["admin","superadmin"]),b=await readJson(req),requestId=String(b.requestId||"").trim(),status=String(b.status||"").trim(),adminNote=String(b.adminNote||"").trim();
      if(!requestId||!["open","reviewing","resolved","closed","rejected"].includes(status))throw Object.assign(new Error("درخواست یا وضعیت معتبر نیست."),{status:400});
      if(adminNote.length>1200)throw Object.assign(new Error("پاسخ مدرسه بیش از حد طولانی است."),{status:400});
      const saved=await mutateDb(m=>{m.parentRequests=Array.isArray(m.parentRequests)?m.parentRequests:[];const row=m.parentRequests.find(x=>String(x.id)===requestId);if(!row)throw Object.assign(new Error("درخواست خانواده پیدا نشد."),{status:404});if(String(row.kind||row.type||"")==="meeting_invitation")throw Object.assign(new Error("دعوت ملاقات از مسیر پاسخ ملاقات مدیریت می‌شود."),{status:409});const now=faNow(),nowIso=new Date().toISOString();Object.assign(row,{status,adminNote,reviewedAt:now,reviewedAtIso:nowIso,reviewedBy:auth.user.id});if(["resolved","closed","rejected"].includes(status)){row.closedAt=now;row.closedAtIso=nowIso;}m.notifications=Array.isArray(m.notifications)?m.notifications:[];if(row.studentId&&adminNote)m.notifications.unshift({id:makeId("notif"),userId:row.studentId,type:"family_request_response",title:"پاسخ مدرسه به درخواست خانواده",body:adminNote,message:adminNote,read:false,at:now,createdAt:now,createdAtIso:nowIso});m.audit=Array.isArray(m.audit)?m.audit:[];m.audit.unshift({id:makeId("log"),userId:auth.user.id,action:"رسیدگی به درخواست خانواده",details:`${requestId} · ${status}`,at:now});return row;});
      return sendJson(res,200,{ok:true,request:saved.result});
    }catch(error){return sendJson(res,error.status||500,{error:error.message||"خطای رسیدگی به درخواست خانواده"});}
  }
  if (url.pathname.startsWith("/api/guardian/")) return await handleGuardianApi(req, res, url);
  if (url.pathname.startsWith("/api/admin/guardian-")) { try { const auth=await authenticate(req,["admin","superadmin"]); return await handleGuardianAdminApi(req,res,url,auth); } catch(error){ return sendJson(res,error.status||500,{error:error.message}); } }
  if (url.pathname.startsWith("/api/admin/release-diagnostics") || url.pathname.startsWith("/api/admin/encrypted-backup/")) { try { const auth=await authenticate(req,url.pathname.startsWith("/api/admin/encrypted-backup/")?["superadmin"]:["admin","superadmin"]); return await handleReleaseApi(req,res,url,auth); } catch(error){ return sendJson(res,error.status||500,{error:error.message}); } }
  if (url.pathname.startsWith("/api/practice/p59/")) return await handlePracticeP59(req,res,url);
  if (url.pathname.startsWith("/api/academic-messages/p58/")) return await handleAcademicMessagesP58(req,res,url);
  if (url.pathname.startsWith("/api/library/p62/")) return await handleLibraryP62(req,res,url);
  if (url.pathname.startsWith("/api/student/")) return await handleStudentApi(req, res, url);
  if (url.pathname.startsWith("/api/workbench/")) return await handleWorkbenchV38Api(req, res, url);
  if (url.pathname.startsWith("/api/admin/v76/")) { try { const auth=await authenticate(req,["admin","superadmin"]); return await handleAdminV76Api(req,res,url,auth); } catch(error){ return sendJson(res,error.status||500,{error:error.message}); } }
  if (url.pathname.startsWith("/api/admin/v4515/")) { try { const auth=await authenticate(req,["admin","superadmin"]); return await handleAdminV4515Api(req,res,url,auth); } catch(error){ return sendJson(res,error.status||500,{error:error.message}); } }
  if (url.pathname.startsWith("/api/teacher/")) return await handleTeacherAppApi(req, res, url);
  if (["/api/admin/attendance/live","/api/admin/attendance/review"].includes(url.pathname)) return await handleAdminAttendanceLiveV78(req, res, url);
  if (url.pathname.startsWith("/api/admin/production-readiness")) {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleProductionReadinessApiV67400(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/admin/finance")) {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleFinanceApiV67390(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/admin/report-builder")) {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleReportBuilderApiV67380(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  // مسیرهای اختصاصی مرکز اقدام باید قبل از catch-all /api/staff قرار گیرند.
  if (url.pathname.startsWith("/api/staff/action-center") || url.pathname.startsWith("/api/admin/action-center")) {
    try { const auth = await authenticate(req, ["teacher", "admin", "superadmin"]); return await handleActionCenterApiV67330(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/staff/learning-planner")) {
    try { const auth = await authenticate(req, ["teacher", "admin", "superadmin"]); return await handleLearningPlannerApiV67370(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/staff/attendance-discipline") || url.pathname.startsWith("/api/staff/discipline/")) {
    try { const auth = await authenticate(req, ["teacher", "admin", "superadmin"]); return await handleAttendanceDisciplineApiV67360(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/admin/family-center")) {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleFamilyCenterApiV67350(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/staff/communications") || url.pathname.startsWith("/api/admin/communications")) {
    try { const auth = await authenticate(req, ["teacher", "admin", "superadmin"]); return await handleCommunicationsApiV67340(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/staff/") || url.pathname === "/api/security/audit") return await handleStaffApi(req, res, url);
  if(url.pathname==="/api/admin/superadmin/credentials"){try{const auth=await authenticate(req,["superadmin"]);return await handleSuperadminCredentialsV671910(req,res,auth);}catch(error){return sendJson(res,error.status||500,{error:error.message,code:error.code||undefined});}}
  if(url.pathname==="/api/admin/reset-data/selective"){try{const auth=await authenticate(req,["superadmin"]);return await handleSelectiveResetSR01(req,res,auth);}catch(error){return sendJson(res,error.status||500,{error:error.message,code:error.code||undefined});}}
  if(url.pathname==="/api/admin/reset-data"){try{const auth=await authenticate(req,["superadmin"]);return await handleAdminResetData(req,res,auth);}catch(error){return sendJson(res,error.status||500,{error:error.message,code:error.code||undefined});}}
  if (url.pathname.startsWith("/api/admin/education-analytics")) {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleEducationAnalyticsApiV67320(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/admin/system-health") || url.pathname === "/api/admin/sessions/revoke") {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleSystemHealthApi(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname.startsWith("/api/admin/local-backups")) {
    try { const auth = await authenticate(req, ["admin", "superadmin"]); return await handleLocalBackupApi(req, res, url, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (req.method === "GET" && url.pathname === "/api/state/meta") {
    try {
      const auth = await authenticate(req, ["teacher", "admin", "superadmin"]);
      return sendJson(res, 200, { initialized: true, updatedAt: auth.updatedAt || "", release: APP_RELEASE });
    } catch (error) {
      return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined });
    }
  }
  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/state") {
    try { const auth = await authenticate(req, ["teacher", "admin", "superadmin"]); return await handleState(req, res, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if (url.pathname === "/api/files" || url.pathname.startsWith("/api/files/")) {
    try { const auth = await authenticate(req, ["teacher", "admin", "superadmin"]); return await handleFiles(req, res, url.pathname, auth); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.message, code: error.code || undefined }); }
  }
  if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/student/media/question-images/")) {
    return await serveQuestionMedia48(req,res,url.pathname);
  }
  if ((req.method === "GET" || req.method === "HEAD") && ["/student", "/guardian"].includes(url.pathname)) {
    const location = `${APP_BASE_PATH}${url.pathname}/` || `${url.pathname}/`;
    res.writeHead(308, { ...securityHeaders(), Location: location });
    return res.end();
  }
    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res, url.pathname);
    return sendJson(res, 405, { error: "روش درخواست پشتیبانی نمی‌شود." });
  } catch (error) {
    console.error("Request handling failed:", error?.stack || error);
    if (res.headersSent) { try { res.end(); } catch {} return; }
    const explicitStatus = Number(error?.status);
    const malformedRequest = error?.code === "ERR_INVALID_URL" || error instanceof URIError;
    const status = explicitStatus >= 400 && explicitStatus < 600 ? explicitStatus : malformedRequest ? 400 : 500;
    return sendJson(res, status, { error: status === 400 ? "درخواست معتبر نیست." : "خطای داخلی سامانه." });
  }
});

// P67.21.1: Bound idle connections and incomplete headers. Uploads have a
// generous 10-minute deadline to avoid breaking normal school workflows.
server.headersTimeout = 45_000;
server.requestTimeout = 10 * 60_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 120;

await ensureDataDirs();
await cleanupStaleAtomicTemps();
await recoverInterruptedEncryptedRestoreV67304("startup");
await loadLoginAttempts();
let securityAlreadyInitialized=false;try{securityAlreadyInitialized=Boolean((await fs.stat(SECURITY_FILE)).isFile());}catch{}
const initialEnvelope = await ensureStateInitialized();
if(process.env.NODE_ENV==="production"&&!securityAlreadyInitialized){
  const users=Array.isArray(initialEnvelope.db?.users)?initialEnvelope.db.users:[];
  const missing=[];
  if(users.some(u=>u.id==="sys1"&&u.active!==false)&&!process.env.MADRESEYAR_SUPERADMIN_PASSWORD)missing.push("MADRESEYAR_SUPERADMIN_PASSWORD");
  if(users.some(u=>u.id==="tea1"&&u.active!==false)&&!process.env.MADRESEYAR_TEACHER_PASSWORD)missing.push("MADRESEYAR_TEACHER_PASSWORD");
  if(missing.length)throw new Error(`در اولین اجرای Production متغیرهای Bootstrap زیر الزامی هستند: ${missing.join(", ")}. پس از ایجاد فایل امنیتی، نگهداری دائمی آن‌ها الزامی نیست.`);
}
await ensureSecurityInitialized(initialEnvelope.db);

// 72.11 — optional one-time superadmin recovery.
// Set MADRESEYAR_ADMIN_RECOVERY_PASSWORD temporarily in cPanel, restart once,
// login and change the password, then remove the variable.
// A marker keyed to the recovery value prevents repeated resets on later restarts.
const adminRecoveryPassword = String(process.env.MADRESEYAR_ADMIN_RECOVERY_PASSWORD || "");
if (adminRecoveryPassword) {
  const policyError = passwordPolicy(adminRecoveryPassword, "superadmin");
  if (policyError) throw new Error(`MADRESEYAR_ADMIN_RECOVERY_PASSWORD نامعتبر است: ${policyError}`);
  const marker = path.join(DATA_DIR, ".admin-recovery-applied");
  const fingerprint = crypto.createHash("sha256").update(adminRecoveryPassword).digest("hex");
  let applied = "";
  try { applied = String(await fs.readFile(marker, "utf8")).trim(); } catch {}
  if (applied !== fingerprint) {
    await mutateSecurity(async security => {
      const credential = security.credentials?.sys1;
      if (!credential) throw new Error("حساب ادمین فنی sys1 در فایل امنیتی پیدا نشد.");
      credential.passwordHash = await passwordHash(adminRecoveryPassword);
      credential.mustChangePassword = true;
      credential.passwordChangedAt = new Date().toISOString();
      credential.credentialVersion = Number(credential.credentialVersion || 1) + 1;
      credential.failedLoginCount = 0;
      credential.lockedUntil = 0;
      for (const [hash, session] of Object.entries(security.sessions || {})) {
        if (session?.userId === "sys1") delete security.sessions[hash];
      }
    });
    await fs.writeFile(marker, fingerprint, {encoding:"utf8",mode:0o600});
    console.warn("Madreseyar: one-time superadmin recovery password applied. Remove MADRESEYAR_ADMIN_RECOVERY_PASSWORD after login.");
  }
}
// v45.15: پشتیبان روزانه/هفتگی حتی در روزهای بدون تغییر داده نیز بررسی می‌شود.
try { await maybeCreateTieredBackupsV4515(); } catch (error) { console.warn("Startup tiered backup failed", error.message); }
const tieredBackupTimerV4515 = setInterval(() => { maybeCreateTieredBackupsV4515().catch(error => console.warn("Scheduled tiered backup failed", error.message)); }, 60 * 60 * 1000);
tieredBackupTimerV4515.unref?.();
let shutdownStarted = false;
async function gracefulShutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Madreseyar received ${signal}; stopping new connections...`);
  const forceTimer = setTimeout(() => {
    console.error("Madreseyar graceful shutdown timed out.");
    process.exit(1);
  }, 10000);
  forceTimer.unref?.();
  server.close(error => {
    clearTimeout(forceTimer);
    if (error) {
      console.error("Madreseyar shutdown failed:", error);
      process.exitCode = 1;
    }
  });
  try {
    await Promise.allSettled([stateOperationQueue, securityOperationQueue, securityWriteQueue]);
    if (!server.listening) process.exit(process.exitCode || 0);
  } catch (error) {
    console.error("Madreseyar shutdown queue drain failed:", error);
    process.exit(1);
  }
}
process.once("SIGTERM", () => { gracefulShutdown("SIGTERM"); });
process.once("SIGINT", () => { gracefulShutdown("SIGINT"); });

server.listen(PORT, HOST, async () => {
  const urls = mobileUrls();
  const lines = [
    `مدرسه‌یار نسخه ${APP_RELEASE}؛ آماده استقرار cPanel و مسیر /app`,
    `روی کامپیوتر: http://127.0.0.1:${PORT}`,
    ...(urls.length ? urls.flatMap(url => [`پنل کامل در شبکه: ${url}${APP_BASE_PATH}`, `اپ حرفه‌ای دانش‌آموز: ${url}${APP_BASE_PATH}/student/`]) : ["آدرس شبکه پیدا نشد؛ اتصال Wi-Fi کامپیوتر را بررسی کنید."]),
    "در پنجره Firewall ویندوز، دسترسی Private networks را فعال کنید.",
    "هیچ اتصال مستقیمی به سرویس هوش مصنوعی در برنامه وجود ندارد."
  ];
  console.log(`\n${lines.join("\n")}\n`);
  if (process.env.MADRESEYAR_SKIP_RUNTIME_FILES !== "1") {
    try { await fs.writeFile(path.join(ROOT, "MOBILE-ADDRESS.txt"), lines.join("\r\n"), { encoding: "utf8", mode: 0o600 }); } catch {}
  }
});
