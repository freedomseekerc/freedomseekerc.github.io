/** FSC Fake Ad v1.2 — Sites server to Google Sheets. */
var CONFIG = {
 SPREADSHEET_ID:'1DKWxpNnWDOmSPRZmd2UtGgPv2oy8ClcdrdBQndxtPqA', OPERATOR:'FSC MVP 프로젝트 팀',
 CONTACT_EMAIL:'freedom.seeker.club@gmail.com', PRIVACY_REVIEWED:true, ACCEPT_APPLICATIONS:true,
 RETENTION_DAYS:90, VERSION:'1.2', CONSENT_VERSION:'1.1', TOKEN_TTL_MS:2*60*60*1000,
 MAX_APPLICATION_ROWS:10000, MAX_EVENT_ROWS:10000, MAX_DAILY_APPLICATIONS:500, MAX_DAILY_EVENTS:5000
};
var APP_HEADERS=['created_at','application_id','service','email','answer','consent_version','consent_at','visit_id','utm_source','utm_medium','utm_campaign','utm_content','device','version','status','age_confirmed','answer_consent'];
var EVENT_HEADERS=['created_at','event_id','service','event_type','visit_id','utm_source','utm_medium','utm_campaign','utm_content','device','version'];
var CHOICES={
 'ai-allpass':{'doc_writing':'문서·글쓰기','image':'이미지','dev':'개발','research':'리서치','etc':'기타'},
 'chongmubot':{'study':'스터디','hobby_club':'동호회·취미','church_community':'교회·커뮤니티','friends_group':'친구모임','etc':'기타'},
 'giftpick':{'birthday':'생일','anniversary':'기념일','thanks_gift':'감사선물','work_acquaintance':'직장·지인','etc':'기타'},
 'fsc_hub':{}
};
function doGet(){return ContentService.createTextOutput(JSON.stringify({ok:true,service:'FSC Sites submission bridge',version:CONFIG.VERSION,consentVersion:CONFIG.CONSENT_VERSION,storageCheck:'not_performed'})).setMimeType(ContentService.MimeType.JSON);}
function publishedUrls_(){var base=ScriptApp.getService().getUrl();if(!base||!/\/exec$/.test(base))throw new Error('Deploy a production Web App (/exec) first.');var urls={bridge:base};console.log(JSON.stringify(urls,null,2));return urls;}
function submitApplication(payload){
 var lock;
 try{
  if(!ready_())return fail_('NOT_READY');
  validateBase_(payload);
  if(payload.company)return fail_('INVALID_INPUT');
  if(payload.consent!==true||payload.ageConfirmed!==true||payload.consentVersion!==CONFIG.CONSENT_VERSION)return fail_('CONSENT_REQUIRED');
  var email=String(payload.email||'').trim().toLowerCase();
  if(!email_(email))return fail_('INVALID_EMAIL');
  var requestId=String(payload.requestId||'');
  if(!/^[a-f0-9-]{32,36}$/i.test(requestId))return fail_('INVALID_INPUT');
  var answer=String(payload.answer||'');
  if(answer&&(!own_(CHOICES[payload.service],answer)||payload.answerConsent!==true))return fail_('INVALID_ANSWER');
  var answerLabel=answer?(CHOICES[payload.service][answer]||''):'';
  lock=LockService.getScriptLock();if(!lock.tryLock(7000))return fail_('BUSY');rate_(payload.visitId);
  var sheet=sheet_('applications',APP_HEADERS);
  var rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,APP_HEADERS.length).getValues():[];
  for(var i=0;i<rows.length;i++){if(rows[i][2]===payload.service&&storedEmail_(rows[i][3])===email)return {ok:true};if(rows[i][1]===requestId)return fail_('INVALID_INPUT');}
  if(rows.length>=CONFIG.MAX_APPLICATION_ROWS)return fail_('CAPACITY');
  daily_('applications',CONFIG.MAX_DAILY_APPLICATIONS);
  var now=new Date().toISOString(),c=campaign_(payload.campaign||{});
  var row=[now,requestId,payload.service,email,answerLabel,CONFIG.CONSENT_VERSION,now,payload.visitId,c.utm_source,c.utm_medium,c.utm_campaign,c.utm_content,payload.device,CONFIG.VERSION,'submitted','true',answer?'true':'false'];
  ensureNextRow_(sheet);var range=sheet.getRange(sheet.getLastRow()+1,1,1,row.length);range.setNumberFormat('@');range.setValues([row.map(safe_)]);SpreadsheetApp.flush();return {ok:true};
 }catch(err){return fail_(errorCode_(err));}finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function trackEvent(payload){
 var lock;
 try{
  if(!ready_())return fail_('NOT_READY');validateBase_(payload);
  if(['landing_view','cta_click'].indexOf(payload.type)<0)return fail_('INVALID_INPUT');
  var eventId=payload.visitId+':'+payload.type;if(payload.eventId!==eventId)return fail_('INVALID_INPUT');
  lock=LockService.getScriptLock();if(!lock.tryLock(4000))return fail_('BUSY');
  var sheet=sheet_('events',EVENT_HEADERS);
  if(sheet.getLastRow()>1&&sheet.getRange(2,2,sheet.getLastRow()-1,1).createTextFinder(eventId).matchEntireCell(true).findNext())return {ok:true};
  if(sheet.getLastRow()-1>=CONFIG.MAX_EVENT_ROWS)return fail_('CAPACITY');daily_('events',CONFIG.MAX_DAILY_EVENTS);
  var c=campaign_(payload.campaign||{}),row=[new Date().toISOString(),eventId,payload.service,payload.type,payload.visitId,c.utm_source,c.utm_medium,c.utm_campaign,c.utm_content,payload.device,CONFIG.VERSION];
  ensureNextRow_(sheet);var range=sheet.getRange(sheet.getLastRow()+1,1,1,row.length);range.setNumberFormat('@');range.setValues([row.map(safe_)]);SpreadsheetApp.flush();return {ok:true};
 }catch(err){return fail_(errorCode_(err));}finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function validateConnection_(){
 var book=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
 var sheets=[['applications',APP_HEADERS],['events',EVENT_HEADERS]].map(function(pair){var sh=book.getSheetByName(pair[0]);if(!sh||sh.getMaxColumns()<pair[1].length||!sh.getLastRow()||sh.getRange(1,1,1,pair[1].length).getValues()[0].join('|')!==pair[1].join('|'))throw new Error('SCHEMA_MISMATCH: '+pair[0]);return pair[0];});
 var properties=PropertiesService.getScriptProperties(),bridgeSecret=properties.getProperty('FSC_BRIDGE_SECRET'),signingSecret=properties.getProperty('FSC_SIGNING_SECRET');
 var result={ok:true,version:CONFIG.VERSION,consentVersion:CONFIG.CONSENT_VERSION,sheets:sheets,storageCheck:'schema_validated',collectionReady:ready_(),bridgeSecretReady:typeof bridgeSecret==='string'&&bridgeSecret.length>=32,signingSecretReady:typeof signingSecret==='string'&&signingSecret.length>=32};console.log(JSON.stringify(result));return result;
}
function ensureNextRow_(sheet){if(sheet.getLastRow()>=sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);}
function ready_(){return CONFIG.ACCEPT_APPLICATIONS===true&&CONFIG.PRIVACY_REVIEWED===true&&email_(CONFIG.CONTACT_EMAIL);}
function own_(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function email_(s){return typeof s==='string'&&s.length<=254&&s.length>=5&&/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s);}
function storedEmail_(s){return String(s).replace(/^'(?=[=+\-@])/,'').trim().toLowerCase();}
function fail_(code){return {ok:false,code:code};}
function errorCode_(e){var c=String(e&&e.message||'');return ['BAD_TOKEN','RATE_LIMIT','CAPACITY','INVALID_INPUT','NOT_READY'].indexOf(c)>=0?c:'SAVE_ERROR';}
function safe_(v){var s=String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,'');return /^[=+\-@]/.test(s)?"'"+s:s;}
function campaign_(p){var out={};['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(k){var v=String(p[k]||'');out[k]=/^[a-zA-Z0-9_.\- ]{0,80}$/.test(v)?v:'';});return out;}
function sheet_(name,headers){var s=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(name);if(!s||s.getRange(1,1,1,headers.length).getValues()[0].join('|')!==headers.join('|'))throw new Error('SCHEMA_MISMATCH');return s;}
function secret_(){var p=PropertiesService.getScriptProperties(),s=p.getProperty('FSC_SIGNING_SECRET');if(!s){s=Utilities.getUuid()+Utilities.getUuid();p.setProperty('FSC_SIGNING_SECRET',s);}return s;}
function signature_(s,v,t){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s+'|'+v+'|'+t,secret_())).replace(/=+$/,'');}
function token_(s,v,t){return String(t)+'.'+signature_(s,v,t);}
function validateBase_(p){
 if(!p||typeof p!=='object'||JSON.stringify(p).length>4500||!own_(CHOICES,p.service))throw new Error('INVALID_INPUT');
 if(!/^[a-f0-9-]{32,36}$/i.test(String(p.visitId||''))||['mobile','tablet','desktop'].indexOf(p.device)<0)throw new Error('INVALID_INPUT');
 var parts=String(p.token||'').split('.'),t=Number(parts[0]),age=Date.now()-t;
 if(parts.length!==2||!Number.isFinite(t)||age<0||age>CONFIG.TOKEN_TTL_MS||parts[1]!==signature_(p.service,p.visitId,t))throw new Error('BAD_TOKEN');
}
function rate_(visit){var c=CacheService.getScriptCache(),key='attempt:'+visit,n=Number(c.get(key)||0);if(n>=6)throw new Error('RATE_LIMIT');c.put(key,String(n+1),600);}
function daily_(kind,max){var p=PropertiesService.getScriptProperties(),key='DAILY_'+kind,day=new Date().toISOString().slice(0,10),data;try{data=JSON.parse(p.getProperty(key)||'{}');}catch(e){data={};}if(data.day!==day)data={day:day,count:0};if(data.count>=max)throw new Error('CAPACITY');data.count++;p.setProperty(key,JSON.stringify(data));}
function doPost(e){
 var result;
 try{
  var raw=e&&e.postData?Utilities.newBlob(e.postData.getBytes()).getDataAsString('UTF-8'):'';if(raw.length>8000)throw new Error('INVALID_INPUT');
  var envelope=JSON.parse(raw),secret=PropertiesService.getScriptProperties().getProperty('FSC_BRIDGE_SECRET');if(!secret||secret.length<32)throw new Error('NOT_READY');
  if(['submitApplication','trackEvent'].indexOf(envelope.action)<0||typeof envelope.payloadJson!=='string'||envelope.payloadJson.length>4500||!/^[a-f0-9-]{32,36}$/i.test(String(envelope.nonce||'')))throw new Error('INVALID_INPUT');
  var age=Date.now()-Number(envelope.issuedAt);if(!Number.isFinite(age)||age<0||age>300000)throw new Error('BAD_TOKEN');
  var message='bridge|'+envelope.action+'|'+envelope.issuedAt+'|'+envelope.nonce+'|'+envelope.payloadJson;
  var expected=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(message,secret,Utilities.Charset.UTF_8)).replace(/=+$/,'');if(!equalSignature_(expected,envelope.signature))throw new Error('BAD_TOKEN');
  var payload=JSON.parse(envelope.payloadJson);if(!payload||typeof payload!=='object'||!own_(CHOICES,payload.service)||!/^[a-f0-9-]{32,36}$/i.test(String(payload.visitId||'')))throw new Error('INVALID_INPUT');
  payload.token=token_(payload.service,payload.visitId,Date.now());result=envelope.action==='submitApplication'?submitApplication(payload):trackEvent(payload);
 }catch(error){result=fail_(errorCode_(error));}
 return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function equalSignature_(a,b){if(typeof b!=='string'||a.length!==b.length)return false;var difference=0;for(var i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}


function myTest() {
  Logger.log(validateConnection_());
}
