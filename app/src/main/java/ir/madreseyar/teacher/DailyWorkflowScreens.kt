package ir.madreseyar.teacher

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Locale

private val DWBrand = Color(0xFF0CA6A4)
private val DWBrandDark = Color(0xFF087782)
private val DWBg = Color(0xFFF3F9FB)
private val DWText = Color(0xFF12313A)
private val DWMuted = Color(0xFF71838A)
private val DWBorder = Color(0xFFDDEBED)
private val DWGood = Color(0xFF16A36A)
private val DWWarn = Color(0xFFF5A524)
private val DWBad = Color(0xFFD94A4A)

private fun JSONArray?.dwObjects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
private fun enc(v: String): String = URLEncoder.encode(v, Charsets.UTF_8.name())
private fun JSONObject.displayName(): String = listOf(optString("firstName"), optString("lastName")).filter { it.isNotBlank() }.joinToString(" ").ifBlank { optString("name", "دانش‌آموز") }
private fun fmt(v: Double?): String = if (v == null || v.isNaN()) "—" else if (kotlin.math.abs(v - v.toInt()) < .001) v.toInt().toString() else String.format(Locale.US, "%.2f", v)
private fun JSONObject.optNullableDouble(key: String): Double? = if (!has(key) || isNull(key)) null else optDouble(key).takeUnless { it.isNaN() }

@Composable
private fun DWHeader(title: String, subtitle: String, action: (@Composable () -> Unit)? = null) {
    Surface(color = Color.White, shadowElevation = 1.dp) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Black, fontSize = 20.sp, color = DWText)
                Text(subtitle, fontSize = 11.sp, color = DWMuted)
            }
            action?.invoke()
        }
    }
}

@Composable
private fun DWCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier.fillMaxWidth(), RoundedCornerShape(20.dp), CardDefaults.cardColors(Color.White), CardDefaults.cardElevation(1.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp), content = content)
    }
}

@Composable
private fun ErrorLine(message: String) {
    if (message.isNotBlank()) Surface(color = Color(0xFFFFEEEE), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Text(message, Modifier.padding(10.dp), color = Color(0xFFA52929), fontSize = 12.sp)
    }
}

@Composable
private fun EmptyLine(text: String) {
    Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Default.Inbox, null, tint = DWMuted.copy(alpha = .6f), modifier = Modifier.size(42.dp))
        Spacer(Modifier.height(8.dp)); Text(text, color = DWMuted, fontSize = 13.sp)
    }
}

private fun decodeDataImage(value: String) = runCatching {
    val b64 = value.substringAfter("base64,", "")
    if (b64.isBlank()) null else Base64.decode(b64, Base64.DEFAULT).let { bytes -> BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
}.getOrNull()

@Composable
private fun StudentAvatar(photo: String, name: String, size: Int = 56) {
    val image = remember(photo) { decodeDataImage(photo) }
    Surface(Modifier.size(size.dp), CircleShape, Color(0xFFE7F7F6)) {
        if (image != null) Image(image, name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Box(contentAlignment = Alignment.Center) {
            val initials = name.trim().split(" ").filter { it.isNotBlank() }.take(2).mapNotNull { it.firstOrNull()?.toString() }.joinToString("")
            if (initials.isBlank()) Icon(Icons.Default.Person, null, tint = DWBrand)
            else Text(initials, fontWeight = FontWeight.Black, color = DWBrand, fontSize = (size / 3).sp)
        }
    }
}

private fun assignmentRows(workspace: JSONObject?): List<JSONObject> = workspace?.optJSONArray("assignments").dwObjects()
private fun workspaceClassName(workspace: JSONObject?, classId: String): String = workspace?.optJSONArray("classes").dwObjects().firstOrNull { it.optString("id") == classId }?.optString("name").orEmpty()

// ---------- 1. Students + dossier ----------
@Composable
fun StudentsProScreen(workspace: JSONObject?) {
    val scope = rememberCoroutineScope()
    val assignments = assignmentRows(workspace)
    val classOptions = remember(assignments) { assignments.distinctBy { it.optString("classId") }.filter { it.optString("classId").isNotBlank() } }
    var classIndex by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    var students by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var selectedId by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        loading = true; error = ""
        try {
            val classId = classOptions.getOrNull(classIndex)?.optString("classId").orEmpty()
            val path = "/api/staff/mobile/students" + if (classId.isNotBlank()) "?classId=${enc(classId)}" else ""
            students = ApiClient.get(path).optJSONArray("students").dwObjects()
        } catch (e: Throwable) { error = e.message ?: "خطا در دریافت دانش‌آموزان" }
        finally { loading = false }
    }
    LaunchedEffect(classIndex, classOptions.size) { reload() }

    selectedId?.let { id -> StudentDossierView(id, onBack = { selectedId = null }); return }

    Column(Modifier.fillMaxSize().background(DWBg)) {
        DWHeader("دانش‌آموزان من", "پروفایل، عکس، حضور و وضعیت آموزشی") {
            IconButton(onClick = { scope.launch { reload() } }) { Icon(Icons.Default.Refresh, null, tint = DWBrand) }
        }
        if (classOptions.isNotEmpty()) LazyColumn(Modifier.fillMaxWidth().heightIn(max = 58.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    classOptions.forEachIndexed { i, a ->
                        FilterChip(selected = classIndex == i, onClick = { classIndex = i }, label = { Text(a.optString("className", workspaceClassName(workspace, a.optString("classId"))).ifBlank { "کلاس ${i + 1}" }) })
                    }
                }
            }
        }
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), leadingIcon = { Icon(Icons.Default.Search, null) }, placeholder = { Text("جستجوی نام یا کد دانش‌آموز") }, singleLine = true, shape = RoundedCornerShape(16.dp))
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = DWBrand)
        ErrorLine(error)
        val filtered = students.filter { s -> query.isBlank() || s.displayName().contains(query, true) || s.optString("studentCode").contains(query, true) }
        if (!loading && filtered.isEmpty()) EmptyLine("دانش‌آموزی در این کلاس پیدا نشد.")
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp, 6.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            items(filtered, key = { it.optString("id") }) { s ->
                DWCard(Modifier.clickable { selectedId = s.optString("id") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StudentAvatar(s.optString("photoDataUrl"), s.displayName())
                        Spacer(Modifier.width(11.dp))
                        Column(Modifier.weight(1f)) {
                            Text(s.displayName(), fontWeight = FontWeight.Black, fontSize = 16.sp, color = DWText)
                            Text("${s.optString("className")} · کد ${s.optString("studentCode", "—")}", color = DWMuted, fontSize = 11.sp)
                            val avg = s.optJSONObject("analysis")?.optNullableDouble("overallAveragePercent")
                            val status = s.optJSONObject("analysis")?.optJSONObject("status")?.optString("label").orEmpty()
                            Text("میانگین عملکرد: ${fmt(avg)}٪${if (status.isNotBlank()) " · $status" else ""}", color = if ((avg ?: 100.0) < 50) DWBad else DWBrandDark, fontSize = 11.sp)
                        }
                        Icon(Icons.Default.ChevronLeft, null, tint = DWMuted)
                    }
                }
            }
        }
    }
}

@Composable
private fun StudentDossierView(studentId: String, onBack: () -> Unit) {
    var dossier by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    LaunchedEffect(studentId) {
        try { dossier = ApiClient.get("/api/workbench/students/${enc(studentId)}/dossier").optJSONObject("dossier") }
        catch (e: Throwable) { error = e.message ?: "پرونده دانش‌آموز دریافت نشد." }
        finally { loading = false }
    }
    val d = dossier
    val profile = d?.optJSONObject("profile") ?: JSONObject()
    Column(Modifier.fillMaxSize().background(DWBg)) {
        DWHeader("پرونده دانش‌آموز", "اطلاعات آموزشی و پیگیری") { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = DWBrand) } }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = DWBrand)
        ErrorLine(error)
        if (d != null) LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                DWCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StudentAvatar(d.optString("photoDataUrl"), profile.displayName(), 76)
                        Spacer(Modifier.width(13.dp))
                        Column(Modifier.weight(1f)) {
                            Text(profile.displayName(), fontWeight = FontWeight.Black, fontSize = 20.sp, color = DWText)
                            Text("کد دانش‌آموز: ${profile.optString("studentCode", "—")}", color = DWMuted)
                            Text(profile.optString("className", profile.optString("classId")), color = DWBrandDark, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            item {
                val a = d.optJSONObject("analysis") ?: JSONObject()
                val att = d.optJSONObject("attendance") ?: JSONObject()
                val dis = d.optJSONObject("discipline") ?: JSONObject()
                DWCard {
                    Text("وضعیت سریع", fontWeight = FontWeight.Black, color = DWText)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        DWMiniStat("میانگین", "${fmt(a.optNullableDouble("overallAveragePercent"))}٪", Icons.Default.AutoGraph)
                        DWMiniStat("حضور", att.optInt("present", att.optInt("presentCount", 0)).toString(), Icons.Default.FactCheck)
                        DWMiniStat("غیبت", att.optInt("absent", att.optInt("absentCount", 0)).toString(), Icons.Default.EventBusy)
                    }
                    val status = a.optJSONObject("status")
                    if (status != null) Text("وضعیت آموزشی: ${status.optString("label", status.optString("title", "—"))}", color = DWBrandDark, fontWeight = FontWeight.Bold)
                    if (dis.length() > 0) Text("انضباط: ${dis.optString("summary", dis.optString("label", "سوابق ثبت‌شده"))}", color = DWMuted, fontSize = 12.sp)
                }
            }
            item {
                val guardians = d.optJSONArray("guardians").dwObjects()
                if (guardians.isNotEmpty()) DWCard {
                    Text("خانواده و تماس", fontWeight = FontWeight.Black, color = DWText)
                    guardians.forEach { g -> Text("${g.optString("name", g.displayName())} · ${g.optString("relationship", "ولی")} · ${g.optString("mobile", g.optString("phone", "—"))}", color = DWMuted, fontSize = 12.sp) }
                }
            }
            item {
                val subjects = d.optJSONObject("analysis")?.optJSONArray("subjects").dwObjects()
                if (subjects.isNotEmpty()) DWCard {
                    Text("عملکرد در درس‌ها", fontWeight = FontWeight.Black, color = DWText)
                    subjects.take(12).forEach { r ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(r.optString("subject", "درس"), color = DWText)
                            Text("${fmt(r.optNullableDouble("average20") ?: r.optNullableDouble("average"))}", color = DWBrandDark, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            item {
                val exams = d.optJSONArray("exams").dwObjects()
                if (exams.isNotEmpty()) DWCard {
                    Text("آزمون‌های اخیر", fontWeight = FontWeight.Black, color = DWText)
                    exams.take(8).forEach { e -> Text("• ${e.optString("title", "آزمون")} · ${e.optString("subject")} ${e.optString("score", "")}", color = DWMuted, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
private fun DWMiniStat(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(min = 80.dp)) {
        Icon(icon, null, tint = DWBrand, modifier = Modifier.size(20.dp)); Text(value, fontWeight = FontWeight.Black, color = DWText); Text(label, color = DWMuted, fontSize = 10.sp)
    }
}

// ---------- 2. Professional gradebook ----------
@Composable
fun ProfessionalGradebookScreen(workspace: JSONObject?) {
    val scope = rememberCoroutineScope()
    val assignments = assignmentRows(workspace)
    var assignmentIndex by remember { mutableIntStateOf(0) }
    var period by remember { mutableStateOf("semester2") }
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val continuousInputs = remember { mutableStateMapOf<String, String>() }
    val finalInputs = remember { mutableStateMapOf<String, String>() }
    var savingId by remember { mutableStateOf("") }

    suspend fun reload() {
        val a = assignments.getOrNull(assignmentIndex) ?: return
        loading = true; error = ""
        try {
            data = ApiClient.get("/api/staff/mobile/gradebook?classId=${enc(a.optString("classId"))}&subject=${enc(a.optString("subject"))}&academicPeriod=$period")
            continuousInputs.clear(); finalInputs.clear()
            data?.optJSONArray("students").dwObjects().forEach { s ->
                val id = s.optString("id")
                val c = s.optJSONObject("continuousApproved")?.optNullableDouble("score") ?: s.optNullableDouble("continuousRaw")
                val f = s.optJSONObject("finalMark")?.optNullableDouble("score")
                continuousInputs[id] = c?.let(::fmt) ?: ""
                finalInputs[id] = f?.let(::fmt) ?: ""
            }
        } catch (e: Throwable) { error = e.message ?: "دفتر نمره دریافت نشد." }
        finally { loading = false }
    }
    LaunchedEffect(assignmentIndex, period, assignments.size) { reload() }

    Column(Modifier.fillMaxSize().background(DWBg)) {
        DWHeader("دفتر نمره حرفه‌ای", "ثبت مستمر، پایانی و مشاهده نتیجه نهایی") { IconButton(onClick = { scope.launch { reload() } }) { Icon(Icons.Default.Refresh, null, tint = DWBrand) } }
        if (assignments.isEmpty()) { EmptyLine("تخصیص تدریس فعالی پیدا نشد."); return@Column }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                DWCard {
                    Text("کلاس و درس", fontWeight = FontWeight.Black, color = DWText)
                    assignments.take(12).forEachIndexed { i, a ->
                        FilterChip(selected = assignmentIndex == i, onClick = { assignmentIndex = i }, label = { Text("${a.optString("subject")} · ${a.optString("className", workspaceClassName(workspace, a.optString("classId")))}") })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = period == "semester1", onClick = { period = "semester1" }, label = { Text("نیم‌سال اول") })
                        FilterChip(selected = period == "semester2", onClick = { period = "semester2" }, label = { Text("نیم‌سال دوم") })
                    }
                }
            }
            if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = DWBrand) }
            if (error.isNotBlank()) item { ErrorLine(error) }
            data?.let { d ->
                item {
                    val shares = d.optJSONObject("shares") ?: JSONObject()
                    val rows = d.optJSONArray("students").dwObjects()
                    val avg = rows.mapNotNull { it.optNullableDouble("termTotal") }.takeIf { it.isNotEmpty() }?.average()
                    DWCard {
                        Text("خلاصه کلاس", fontWeight = FontWeight.Black, color = DWText)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            DWMiniStat("مستمر", "${fmt(shares.optNullableDouble("continuousMax"))}", Icons.Default.TrendingUp)
                            DWMiniStat("پایانی", "${fmt(shares.optNullableDouble("finalMax"))}", Icons.Default.AssignmentTurnedIn)
                            DWMiniStat("میانگین", fmt(avg), Icons.Default.Groups)
                        }
                        if (d.optJSONObject("lock")?.optBoolean("active") == true) Text("نمرات این درس قفل شده‌اند.", color = DWBad, fontWeight = FontWeight.Bold)
                    }
                }
                items(d.optJSONArray("students").dwObjects(), key = { it.optString("id") }) { s ->
                    val id = s.optString("id")
                    val shares = d.optJSONObject("shares") ?: JSONObject()
                    val cMax = shares.optDouble("continuousMax", 5.0)
                    val fMax = shares.optDouble("finalMax", 15.0)
                    DWCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(Modifier.size(42.dp), CircleShape, Color(0xFFE7F7F6)) { Box(contentAlignment = Alignment.Center) { Icon(Icons.Default.Person, null, tint = DWBrand) } }
                            Spacer(Modifier.width(9.dp))
                            Column(Modifier.weight(1f)) { Text(s.displayName(), fontWeight = FontWeight.Black, color = DWText); Text("محاسبه مستمر: ${fmt(s.optNullableDouble("continuousCalculated20"))} از ۲۰", color = DWMuted, fontSize = 10.sp) }
                            Surface(color = DWBrand.copy(alpha = .1f), shape = RoundedCornerShape(12.dp)) { Text("${fmt(s.optNullableDouble("termTotal"))} / ۲۰", Modifier.padding(8.dp), color = DWBrandDark, fontWeight = FontWeight.Black) }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(continuousInputs[id].orEmpty(), { continuousInputs[id] = it }, Modifier.weight(1f), label = { Text("مستمر / ${fmt(cMax)}") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
                            OutlinedTextField(finalInputs[id].orEmpty(), { finalInputs[id] = it }, Modifier.weight(1f), label = { Text("پایانی / ${fmt(fMax)}") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, enabled = fMax > 0)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(enabled = savingId.isBlank(), onClick = {
                                val a = assignments[assignmentIndex]; val score = continuousInputs[id]?.toDoubleOrNull()
                                if (score == null) { error = "نمره مستمر ${s.displayName()} معتبر نیست."; return@Button }
                                scope.launch { savingId = id; try { ApiClient.post("/api/staff/gradebook/approve-continuous", JSONObject().put("studentId", id).put("classId", a.optString("classId")).put("subject", a.optString("subject")).put("academicPeriod", period).put("score", score)); reload() } catch (e: Throwable) { error = e.message ?: "ثبت نمره ناموفق بود." } finally { savingId = "" } }
                            }, colors = ButtonDefaults.buttonColors(containerColor = DWBrand), modifier = Modifier.weight(1f)) { Text(if (savingId == id) "…" else "ثبت مستمر") }
                            Button(enabled = savingId.isBlank() && fMax > 0, onClick = {
                                val a = assignments[assignmentIndex]; val score = finalInputs[id]?.toDoubleOrNull()
                                if (score == null) { error = "نمره پایانی ${s.displayName()} معتبر نیست."; return@Button }
                                scope.launch { savingId = id; try { ApiClient.post("/api/staff/gradebook/final-mark", JSONObject().put("studentId", id).put("classId", a.optString("classId")).put("subject", a.optString("subject")).put("academicPeriod", period).put("score", score)); reload() } catch (e: Throwable) { error = e.message ?: "ثبت نمره ناموفق بود." } finally { savingId = "" } }
                            }, colors = ButtonDefaults.buttonColors(containerColor = DWBrandDark), modifier = Modifier.weight(1f)) { Text(if (savingId == id) "…" else "ثبت پایانی") }
                        }
                    }
                }
            }
        }
    }
}

// ---------- 3. Class journal ----------
@Composable
fun ClassJournalScreen(workspace: JSONObject?) {
    val scope = rememberCoroutineScope(); val assignments = assignmentRows(workspace)
    var assignmentIndex by remember { mutableIntStateOf(0) }; var period by remember { mutableStateOf("semester2") }
    var logs by remember { mutableStateOf<List<JSONObject>>(emptyList()) }; var loading by remember { mutableStateOf(false) }; var error by remember { mutableStateOf("") }
    var edit by remember { mutableStateOf<JSONObject?>(null) }; var add by remember { mutableStateOf(false) }
    suspend fun reload() { val a=assignments.getOrNull(assignmentIndex)?:return; loading=true;error="";try{logs=ApiClient.get("/api/staff/mobile/class-journal?classId=${enc(a.optString("classId"))}&subject=${enc(a.optString("subject"))}&academicPeriod=$period").optJSONArray("logs").dwObjects()}catch(e:Throwable){error=e.message?:"دفتر کلاسی دریافت نشد."}finally{loading=false} }
    LaunchedEffect(assignmentIndex,period,assignments.size){reload()}
    Column(Modifier.fillMaxSize().background(DWBg)){
        DWHeader("دفتر کلاسی","جلسه، محتوای تدریس، تکلیف و یادداشت خصوصی") { FilledIconButton(onClick={add=true},colors=IconButtonDefaults.filledIconButtonColors(containerColor=DWBrand)){Icon(Icons.Default.Add,null)} }
        if(assignments.isEmpty()){EmptyLine("تخصیص تدریس فعالی وجود ندارد.");return@Column}
        LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            item{DWCard{assignments.take(12).forEachIndexed{i,a->FilterChip(selected=assignmentIndex==i,onClick={assignmentIndex=i},label={Text("${a.optString("subject")} · ${a.optString("className",workspaceClassName(workspace,a.optString("classId")))}")})};Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){FilterChip(selected=period=="semester1",onClick={period="semester1"},label={Text("نیم‌سال اول")});FilterChip(selected=period=="semester2",onClick={period="semester2"},label={Text("نیم‌سال دوم")})}}}
            if(loading)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=DWBrand)}
            if(error.isNotBlank())item{ErrorLine(error)}
            if(!loading&&logs.isEmpty())item{EmptyLine("هنوز جلسه‌ای در دفتر کلاسی ثبت نشده است.")}
            items(logs,key={it.optString("id")}){r->
                val status=r.optString("status","taught");val statusFa=when(status){"planned"->"برنامه‌ریزی‌شده";"cancelled"->"لغوشده";else->"تدریس‌شده"}
                DWCard(Modifier.clickable{edit=r}){Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(r.optString("title",r.optString("chapterTitle","جلسه کلاس")),fontWeight=FontWeight.Black,color=DWText);Text("${r.optString("date")} · زنگ ${r.optInt("periodNo",0)} · ${r.optString("chapterTitle")}",color=DWMuted,fontSize=11.sp)};AssistChip(onClick={},label={Text(statusFa)},colors=AssistChipDefaults.assistChipColors(labelColor=if(status=="cancelled")DWBad else DWBrandDark))};if(r.optString("content").isNotBlank())Text(r.optString("content"),maxLines=3,overflow=TextOverflow.Ellipsis,color=DWText,fontSize=12.sp);if(r.optString("homework").isNotBlank())Text("تکلیف: ${r.optString("homework")}",color=DWWarn,fontSize=11.sp);Text("برای ویرایش لمس کنید",color=DWMuted,fontSize=9.sp)}
            }
        }
        if(add||edit!=null) ClassJournalDialog(assignments.getOrNull(assignmentIndex),period,edit,onDismiss={add=false;edit=null},onSaved={add=false;edit=null;scope.launch{reload()}})
    }
}

@Composable
private fun ClassJournalDialog(assignment:JSONObject?,period:String,existing:JSONObject?,onDismiss:()->Unit,onSaved:()->Unit){
    val scope=rememberCoroutineScope();var date by remember(existing){mutableStateOf(existing?.optString("date").orEmpty().ifBlank{java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(java.util.Date())})};var periodNo by remember(existing){mutableStateOf(existing?.optInt("periodNo",0)?.takeIf{it>0}?.toString().orEmpty())};var chapter by remember(existing){mutableStateOf(existing?.optString("chapterTitle").orEmpty())};var title by remember(existing){mutableStateOf(existing?.optString("title").orEmpty())};var content by remember(existing){mutableStateOf(existing?.optString("content").orEmpty())};var homework by remember(existing){mutableStateOf(existing?.optString("homework").orEmpty())};var note by remember(existing){mutableStateOf(existing?.optString("privateNote").orEmpty())};var status by remember(existing){mutableStateOf(existing?.optString("status","taught")?:"taught")};var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf("")}
    AlertDialog(onDismissRequest=onDismiss,title={Text(if(existing==null)"ثبت جلسه جدید" else "ویرایش جلسه")},text={LazyColumn{item{Row(horizontalArrangement=Arrangement.spacedBy(5.dp)){listOf("planned" to "برنامه", "taught" to "تدریس شد", "cancelled" to "لغو شد").forEach{(k,l)->FilterChip(selected=status==k,onClick={status=k},label={Text(l)})}};OutlinedTextField(date,{date=it},Modifier.fillMaxWidth(),label={Text("تاریخ YYYY-MM-DD")},singleLine=true);OutlinedTextField(periodNo,{periodNo=it.filter(Char::isDigit)},Modifier.fillMaxWidth(),label={Text("شماره زنگ")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),singleLine=true);OutlinedTextField(chapter,{chapter=it},Modifier.fillMaxWidth(),label={Text("فصل/درس")});OutlinedTextField(title,{title=it},Modifier.fillMaxWidth(),label={Text("عنوان جلسه")});OutlinedTextField(content,{content=it},Modifier.fillMaxWidth(),label={Text("محتوای تدریس")},minLines=3);OutlinedTextField(homework,{homework=it},Modifier.fillMaxWidth(),label={Text("تکلیف این جلسه")},minLines=2);OutlinedTextField(note,{note=it},Modifier.fillMaxWidth(),label={Text("یادداشت خصوصی معلم")},minLines=2);ErrorLine(error)}}},confirmButton={Button(enabled=!busy&&assignment!=null,onClick={val a=assignment?:return@Button;scope.launch{busy=true;try{ApiClient.post("/api/staff/mobile/class-journal",JSONObject().put("id",existing?.optString("id").orEmpty()).put("classId",a.optString("classId")).put("subject",a.optString("subject")).put("academicPeriod",period).put("date",date).put("periodNo",periodNo.toIntOrNull()?:0).put("chapterTitle",chapter).put("title",title).put("content",content).put("homework",homework).put("privateNote",note).put("status",status));onSaved()}catch(e:Throwable){error=e.message?:"ثبت جلسه ناموفق بود."}finally{busy=false}}},colors=ButtonDefaults.buttonColors(containerColor=DWBrand)){Text(if(busy)"در حال ثبت…" else "ذخیره جلسه")}},dismissButton={TextButton(onClick=onDismiss){Text("انصراف")}})
}

// ---------- 4. Homework center ----------
private data class DWAttachment(val name:String,val type:String,val dataUrl:String,val size:Int)

@Composable
fun HomeworkCenterProScreen(workspace: JSONObject?) {
    val scope=rememberCoroutineScope();var homework by remember{mutableStateOf<List<JSONObject>>(emptyList())};var loading by remember{mutableStateOf(true)};var error by remember{mutableStateOf("")};var add by remember{mutableStateOf(false)};var selected by remember{mutableStateOf<JSONObject?>(null)}
    suspend fun reload(){loading=true;error="";try{homework=ApiClient.get("/api/staff/mobile/homework-center").optJSONArray("homework").dwObjects();selected?.let{old->selected=homework.firstOrNull{it.optString("id")==old.optString("id")}}}catch(e:Throwable){error=e.message?:"مرکز تکالیف دریافت نشد."}finally{loading=false}}
    LaunchedEffect(Unit){reload()}
    selected?.let{h->HomeworkDetailView(h,onBack={selected=null},onReload={scope.launch{reload()}});return}
    Column(Modifier.fillMaxSize().background(DWBg)){
        DWHeader("مرکز تکالیف","ساخت، تحویل‌ها، تصحیح و بازخورد") { FilledIconButton(onClick={add=true},colors=IconButtonDefaults.filledIconButtonColors(containerColor=DWBrand)){Icon(Icons.Default.Add,null)} }
        if(loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=DWBrand)
        ErrorLine(error)
        if(!loading&&homework.isEmpty())EmptyLine("هنوز تکلیفی ثبت نشده است.")
        LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            items(homework,key={it.optString("id")}){h->DWCard(Modifier.clickable{selected=h}){Row(verticalAlignment=Alignment.CenterVertically){Surface(Modifier.size(45.dp),RoundedCornerShape(13.dp),DWBrand.copy(alpha=.1f)){Box(contentAlignment=Alignment.Center){Icon(Icons.Default.Assignment,null,tint=DWBrand)}};Spacer(Modifier.width(10.dp));Column(Modifier.weight(1f)){Text(h.optString("title","تکلیف"),fontWeight=FontWeight.Black,color=DWText);Text("${h.optString("subject")} · ${h.optString("className")}",color=DWMuted,fontSize=11.sp);Text("مهلت: ${h.optString("dueAtJalali",h.optString("dueAt","—"))} ${h.optString("dueTime")}",color=DWMuted,fontSize=10.sp)};Icon(Icons.Default.ChevronLeft,null,tint=DWMuted)};Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text("${h.optInt("assignedCount")} نفر",color=DWMuted,fontSize=11.sp);Text("${h.optInt("submittedCount")} تحویل",color=DWBrandDark,fontSize=11.sp);Text("${h.optInt("gradedCount")} تصحیح",color=DWGood,fontSize=11.sp)}}}
        }
        if(add)HomeworkProCreateDialog(workspace,onDismiss={add=false},onSaved={add=false;scope.launch{reload()}})
    }
}

@Composable
private fun HomeworkDetailView(homework:JSONObject,onBack:()->Unit,onReload:()->Unit){
    var grading by remember{mutableStateOf<JSONObject?>(null)}
    Column(Modifier.fillMaxSize().background(DWBg)){
        DWHeader(homework.optString("title","تکلیف"),"${homework.optString("subject")} · تحویل‌ها و تصحیح") { IconButton(onClick=onBack){Icon(Icons.Default.ArrowBack,null,tint=DWBrand)} }
        LazyColumn(contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            item{DWCard{Text(homework.optString("description"),color=DWText);Text("بارم: ${fmt(homework.optNullableDouble("totalScore"))} · مهلت: ${homework.optString("dueAtJalali",homework.optString("dueAt","—"))}",color=DWMuted,fontSize=11.sp);Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){DWMiniStat("تخصیص",homework.optInt("assignedCount").toString(),Icons.Default.Groups);DWMiniStat("تحویل",homework.optInt("submittedCount").toString(),Icons.Default.UploadFile);DWMiniStat("تصحیح",homework.optInt("gradedCount").toString(),Icons.Default.DoneAll)}}}
            val subs=homework.optJSONArray("submissions").dwObjects()
            if(subs.isEmpty())item{EmptyLine("هنوز پاسخی تحویل نشده است.")}
            items(subs,key={it.optString("id")}){s->DWCard{Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(s.optString("studentName","دانش‌آموز"),fontWeight=FontWeight.Black,color=DWText);Text("کد ${s.optString("studentCode","—")} · ${s.optString("submittedAt","")}",fontSize=10.sp,color=DWMuted)};if(s.optString("status")=="graded")AssistChip(onClick={},label={Text("${fmt(s.optNullableDouble("score"))}/${fmt(s.optNullableDouble("maxScore") ?: homework.optNullableDouble("totalScore"))}")})};if(s.optString("text").isNotBlank())Text("پاسخ: ${s.optString("text")}",color=DWText,fontSize=12.sp);val attach=s.optJSONArray("attachmentIds")?.length()?:0;if(attach>0)Text("$attach فایل پیوست دانش‌آموز",color=DWBrandDark,fontSize=11.sp);if(s.optString("feedback").isNotBlank())Text("بازخورد: ${s.optString("feedback")}",color=DWMuted,fontSize=11.sp);Button(onClick={grading=s},colors=ButtonDefaults.buttonColors(containerColor=DWBrand),modifier=Modifier.fillMaxWidth()){Icon(Icons.Default.Grading,null);Spacer(Modifier.width(5.dp));Text(if(s.optString("status")=="graded")"ویرایش نمره" else "تصحیح تکلیف")}}}
        }
        grading?.let{s->HomeworkGradeDialog(homework,s,onDismiss={grading=null},onSaved={grading=null;onReload()})}
    }
}

@Composable
private fun HomeworkGradeDialog(homework:JSONObject,submission:JSONObject,onDismiss:()->Unit,onSaved:()->Unit){val scope=rememberCoroutineScope();var score by remember{submission.optNullableDouble("score")?.let{mutableStateOf(fmt(it))}?:mutableStateOf("")};var feedback by remember{mutableStateOf(submission.optString("feedback"))};var error by remember{mutableStateOf("")};var busy by remember{mutableStateOf(false)};AlertDialog(onDismissRequest=onDismiss,title={Text("تصحیح ${submission.optString("studentName")}")},text={Column{Text("بارم: ${fmt(homework.optNullableDouble("totalScore"))}",color=DWMuted);OutlinedTextField(score,{score=it},Modifier.fillMaxWidth(),label={Text("نمره")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal));OutlinedTextField(feedback,{feedback=it},Modifier.fillMaxWidth(),label={Text("بازخورد معلم")},minLines=3);ErrorLine(error)}},confirmButton={Button(enabled=!busy,onClick={val n=score.toDoubleOrNull();if(n==null){error="نمره معتبر نیست.";return@Button};scope.launch{busy=true;try{ApiClient.post("/api/staff/homework/grade",JSONObject().put("submissionId",submission.optString("id")).put("score",n).put("feedback",feedback));onSaved()}catch(e:Throwable){error=e.message?:"تصحیح ناموفق بود."}finally{busy=false}}},colors=ButtonDefaults.buttonColors(containerColor=DWBrand)){Text("ثبت نمره")}},dismissButton={TextButton(onClick=onDismiss){Text("انصراف")}})}

@Composable
private fun HomeworkProCreateDialog(workspace:JSONObject?,onDismiss:()->Unit,onSaved:()->Unit){
    val context=LocalContext.current;val scope=rememberCoroutineScope();val assignments=assignmentRows(workspace);var ai by remember{mutableIntStateOf(0)};var title by remember{mutableStateOf("")};var desc by remember{mutableStateOf("")};var due by remember{mutableStateOf("")};var dueTime by remember{mutableStateOf("23:59")};var total by remember{mutableStateOf("20")};var publish by remember{mutableStateOf(true)};var allowLate by remember{mutableStateOf(false)};var selectedOnly by remember{mutableStateOf(false)};val selectedIds=remember{mutableStateMapOf<String,Boolean>()};var attachments by remember{mutableStateOf<List<DWAttachment>>(emptyList())};var error by remember{mutableStateOf("")};var busy by remember{mutableStateOf(false)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){uris:List<Uri>->
        val built=uris.take(2).mapNotNull{uri->runCatching{val type=context.contentResolver.getType(uri)?:return@runCatching null;if(type !in setOf("image/jpeg","image/png","image/webp","application/pdf"))return@runCatching null;val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:return@runCatching null;if(bytes.size>650*1024)return@runCatching null;var name="پیوست";context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{c->if(c.moveToFirst())name=c.getString(0)?:name};DWAttachment(name,type,"data:$type;base64,${Base64.encodeToString(bytes,Base64.NO_WRAP)}",bytes.size)}.getOrNull()};attachments=built
    }
    val a=assignments.getOrNull(ai);val students=workspace?.optJSONArray("students").dwObjects().filter{it.optString("classId")==a?.optString("classId")}
    AlertDialog(onDismissRequest=onDismiss,title={Text("تکلیف جدید")},text={LazyColumn{item{assignments.take(10).forEachIndexed{i,x->FilterChip(selected=ai==i,onClick={ai=i;selectedIds.clear()},label={Text("${x.optString("subject")} · ${x.optString("className",workspaceClassName(workspace,x.optString("classId")))}")})};OutlinedTextField(title,{title=it},Modifier.fillMaxWidth(),label={Text("عنوان")});OutlinedTextField(desc,{desc=it},Modifier.fillMaxWidth(),label={Text("توضیحات")},minLines=3);Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){OutlinedTextField(due,{due=it},Modifier.weight(1f),label={Text("تاریخ YYYY-MM-DD")});OutlinedTextField(dueTime,{dueTime=it},Modifier.weight(.7f),label={Text("ساعت")})};OutlinedTextField(total,{total=it},Modifier.fillMaxWidth(),label={Text("بارم")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal));Row(verticalAlignment=Alignment.CenterVertically){Switch(selectedOnly,{selectedOnly=it});Text("فقط دانش‌آموزان انتخابی")};if(selectedOnly){students.forEach{s->FilterChip(selected=selectedIds[s.optString("id")]==true,onClick={selectedIds[s.optString("id")]=!(selectedIds[s.optString("id")]?:false)},label={Text(s.displayName())})}};Row(verticalAlignment=Alignment.CenterVertically){Switch(publish,{publish=it});Text("انتشار برای دانش‌آموزان")};Row(verticalAlignment=Alignment.CenterVertically){Switch(allowLate,{allowLate=it});Text("اجازه تحویل دیرهنگام")};OutlinedButton(onClick={(context as? MainActivity)?.suppressNextUnlock();picker.launch(arrayOf("image/jpeg","image/png","image/webp","application/pdf"))},modifier=Modifier.fillMaxWidth()){Icon(Icons.Default.AttachFile,null);Spacer(Modifier.width(4.dp));Text("پیوست تکلیف (${attachments.size}/2)")};attachments.forEach{Text("• ${it.name} · ${it.size/1024}KB",fontSize=10.sp,color=DWMuted)};ErrorLine(error)}}},confirmButton={Button(enabled=!busy&&a!=null,onClick={val ass=a?:return@Button;val selected=selectedIds.filterValues{it}.keys;if(selectedOnly&&selected.isEmpty()){error="حداقل یک دانش‌آموز انتخاب کنید.";return@Button};scope.launch{busy=true;try{val files=JSONArray();attachments.forEach{files.put(JSONObject().put("name",it.name).put("type",it.type).put("size",it.size).put("dataUrl",it.dataUrl))};ApiClient.post("/api/staff/homework/p652/save",JSONObject().put("classId",ass.optString("classId")).put("subject",ass.optString("subject")).put("title",title).put("description",desc).put("dueAt",due).put("dueTime",dueTime).put("totalScore",total.toDoubleOrNull()?:20.0).put("allowLate",allowLate).put("publicationState",if(publish)"published" else "draft").put("recipientMode",if(selectedOnly)"selected" else "all").put("studentIds",JSONArray(selected.toList())).put("academicPeriod","semester2").put("attachments",files));onSaved()}catch(e:Throwable){error=e.message?:"ثبت تکلیف ناموفق بود."}finally{busy=false}}},colors=ButtonDefaults.buttonColors(containerColor=DWBrand)){Text(if(busy)"در حال ثبت…" else "ذخیره تکلیف")}},dismissButton={TextButton(onClick=onDismiss){Text("انصراف")}})
}

// ---------- 5. Professional exam grading ----------
@Composable
fun ProfessionalGradingScreen(workspace: JSONObject?) {
    val scope=rememberCoroutineScope();var queue by remember{mutableStateOf<List<JSONObject>>(emptyList())};var loading by remember{mutableStateOf(true)};var error by remember{mutableStateOf("")};var selected by remember{mutableStateOf<String?>(null)};var filter by remember{mutableStateOf("pending")}
    suspend fun reload(){loading=true;error="";try{queue=ApiClient.get("/api/staff/mobile/grading-queue").optJSONArray("queue").dwObjects()}catch(e:Throwable){error=e.message?:"صف تصحیح دریافت نشد."}finally{loading=false}}
    LaunchedEffect(Unit){reload()}
    selected?.let{id->GradingDetailView(id,onBack={selected=null},onSaved={selected=null;scope.launch{reload()}});return}
    Column(Modifier.fillMaxSize().background(DWBg)){
        DWHeader("تصحیح آزمون","پاسخ سؤال‌به‌سؤال، بارم و بازخورد") { IconButton(onClick={scope.launch{reload()}}){Icon(Icons.Default.Refresh,null,tint=DWBrand)} }
        Row(Modifier.padding(16.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){FilterChip(selected=filter=="pending",onClick={filter="pending"},label={Text("در انتظار (${queue.count{it.optString("status")=="pending"}})")});FilterChip(selected=filter=="final",onClick={filter="final"},label={Text("تصحیح‌شده (${queue.count{it.optString("status")=="final"}})")})}
        if(loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=DWBrand);ErrorLine(error)
        val rows=queue.filter{it.optString("status")==filter};if(!loading&&rows.isEmpty())EmptyLine(if(filter=="pending")"برگه‌ای در انتظار تصحیح نیست." else "برگه تصحیح‌شده‌ای وجود ندارد.")
        LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){items(rows,key={it.optString("submissionId")}){r->DWCard(Modifier.clickable{selected=r.optString("submissionId")}){Row(verticalAlignment=Alignment.CenterVertically){Surface(Modifier.size(44.dp),CircleShape,DWBrand.copy(alpha=.1f)){Box(contentAlignment=Alignment.Center){Icon(Icons.Default.Grading,null,tint=DWBrand)}};Spacer(Modifier.width(10.dp));Column(Modifier.weight(1f)){Text(r.optString("studentName"),fontWeight=FontWeight.Black,color=DWText);Text("${r.optString("examTitle")} · ${r.optString("subject")}",color=DWMuted,fontSize=11.sp);Text(r.optString("submittedAt"),color=DWMuted,fontSize=9.sp)};if(filter=="final")Text("${fmt(r.optNullableDouble("finalScore"))}/${fmt(r.optNullableDouble("totalScore"))}",color=DWGood,fontWeight=FontWeight.Black)else Icon(Icons.Default.ChevronLeft,null,tint=DWMuted)}}}}
    }
}

@Composable
private fun GradingDetailView(submissionId:String,onBack:()->Unit,onSaved:()->Unit){
    val scope=rememberCoroutineScope();var data by remember{mutableStateOf<JSONObject?>(null)};var loading by remember{mutableStateOf(true)};var error by remember{mutableStateOf("")};val scores=remember{mutableStateMapOf<String,String>()};val comments=remember{mutableStateMapOf<String,String>()};var overall by remember{mutableStateOf("")};var editReason by remember{mutableStateOf("")};var publishNow by remember{mutableStateOf(true)};var busy by remember{mutableStateOf(false)}
    suspend fun load(){loading=true;try{data=ApiClient.get("/api/staff/mobile/grading-detail?submissionId=${enc(submissionId)}");scores.clear();comments.clear();val d=data;val existing=d?.optJSONObject("grade");val existingRows=existing?.optJSONArray("questionScores").dwObjects().associateBy{it.optString("questionId")};d?.optJSONArray("questions").dwObjects().forEach{q->val id=q.optString("id");val er=existingRows[id];scores[id]=fmt(er?.optNullableDouble("teacherScore")?:q.optNullableDouble("autoScore"));comments[id]=er?.optString("feedback").orEmpty()};overall=existing?.optString("feedback").orEmpty()}catch(e:Throwable){error=e.message?:"برگه دریافت نشد."}finally{loading=false}}
    LaunchedEffect(submissionId){load()};val d=data;val finalized=d?.optJSONObject("grade")!=null
    Column(Modifier.fillMaxSize().background(DWBg)){
        DWHeader("تصحیح برگه","ثبت نمره برای هر سؤال") { IconButton(onClick=onBack){Icon(Icons.Default.ArrowBack,null,tint=DWBrand)} }
        if(loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=DWBrand);ErrorLine(error)
        d?.let{json->val st=json.optJSONObject("student")?:JSONObject();val exam=json.optJSONObject("exam")?:JSONObject();LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            item{DWCard{Text(st.displayName(),fontWeight=FontWeight.Black,fontSize=18.sp,color=DWText);Text("${exam.optString("title")} · ${exam.optString("subject")} · بارم ${fmt(exam.optNullableDouble("totalScore"))}",color=DWMuted);val files=json.optJSONObject("submission")?.optJSONArray("files")?.length()?:0;if(files>0)Text("$files فایل پاسخ ضمیمه شده",color=DWBrandDark,fontSize=11.sp);if(finalized)Text("این برگه قبلاً نهایی شده است: ${fmt(json.optJSONObject("grade")?.optNullableDouble("finalScore"))}",color=DWGood,fontWeight=FontWeight.Bold)}}
            items(json.optJSONArray("questions").dwObjects(),key={it.optString("id")}){q->val id=q.optString("id");DWCard{Text("سؤال ${q.optInt("number")} · ${fmt(q.optNullableDouble("score"))} نمره",color=DWBrandDark,fontWeight=FontWeight.Black);Text(q.optString("text"),color=DWText);Surface(color=Color(0xFFF6FAFB),shape=RoundedCornerShape(12.dp),modifier=Modifier.fillMaxWidth()){Column(Modifier.padding(10.dp)){Text("پاسخ دانش‌آموز",fontSize=10.sp,color=DWMuted);Text(q.optString("studentAnswer","—").ifBlank{"—"},color=DWText)}};if(q.optString("referenceAnswer").isNotBlank())Text("پاسخ مرجع: ${q.optString("referenceAnswer")}",fontSize=11.sp,color=DWMuted);if(q.optBoolean("autoGraded"))Text("نمره خودکار: ${fmt(q.optNullableDouble("autoScore"))}",fontSize=11.sp,color=DWGood);OutlinedTextField(scores[id].orEmpty(),{scores[id]=it},Modifier.fillMaxWidth(),label={Text("نمره این سؤال / ${fmt(q.optNullableDouble("score"))}")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),enabled=!finalized);OutlinedTextField(comments[id].orEmpty(),{comments[id]=it},Modifier.fillMaxWidth(),label={Text("بازخورد این سؤال")},enabled=!finalized)}}
            if(!finalized)item{DWCard{OutlinedTextField(overall,{overall=it},Modifier.fillMaxWidth(),label={Text("بازخورد کلی")},minLines=2);val autoChanged=json.optJSONArray("questions").dwObjects().any{q->q.optBoolean("autoGraded")&&scores[q.optString("id")]?.toDoubleOrNull()!=null&&kotlin.math.abs((scores[q.optString("id")]?.toDoubleOrNull()?:0.0)-(q.optNullableDouble("autoScore")?:0.0))>.001};if(autoChanged)OutlinedTextField(editReason,{editReason=it},Modifier.fillMaxWidth(),label={Text("دلیل تغییر نمره خودکار")});Row(verticalAlignment=Alignment.CenterVertically){Switch(publishNow,{publishNow=it});Text("انتشار نتیجه برای دانش‌آموز")};Button(enabled=!busy,onClick={val questions=json.optJSONArray("questions").dwObjects();val bad=questions.firstOrNull{q->val x=scores[q.optString("id")]?.toDoubleOrNull();x==null||x<0||x>(q.optNullableDouble("score")?:0.0)};if(bad!=null){error="نمره سؤال ${bad.optInt("number")} معتبر نیست.";return@Button};val changed=questions.any{q->q.optBoolean("autoGraded")&&kotlin.math.abs((scores[q.optString("id")]?.toDoubleOrNull()?:0.0)-(q.optNullableDouble("autoScore")?:0.0))>.001};if(changed&&editReason.trim().length<3){error="برای تغییر نمره خودکار، دلیل کوتاهی بنویسید.";return@Button};scope.launch{busy=true;try{val arr=JSONArray();questions.forEach{q->val qid=q.optString("id");arr.put(JSONObject().put("questionId",qid).put("teacherScore",scores[qid]?.toDoubleOrNull()?:0.0).put("feedback",comments[qid].orEmpty()))};ApiClient.post("/api/staff/exam-grading/p6722",JSONObject().put("submissionId",submissionId).put("questionScores",arr).put("feedback",overall).put("teacherEditReason",editReason).put("publishNow",publishNow));onSaved()}catch(e:Throwable){error=e.message?:"نهایی‌سازی تصحیح ناموفق بود."}finally{busy=false}}},modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.buttonColors(containerColor=DWBrand)){Icon(Icons.Default.DoneAll,null);Spacer(Modifier.width(6.dp));Text(if(busy)"در حال ثبت…" else "نهایی کردن تصحیح")}}}
        }}
    }
}
