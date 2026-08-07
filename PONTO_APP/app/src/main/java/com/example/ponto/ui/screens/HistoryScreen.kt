package com.example.ponto.ui.screens

import android.app.TimePickerDialog
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ponto.model.WorkDay
import com.example.ponto.viewmodel.MainViewModel
import java.util.*

@Composable
fun HistoryScreen(viewModel: MainViewModel) {
    val workDays by viewModel.allWorkDays.collectAsState()
    val totalBalance = viewModel.calculateBalance(workDays)
    val context = LocalContext.current

    var workDayToEdit by remember { mutableStateOf<WorkDay?>(null) }
    var workDayToDelete by remember { mutableStateOf<WorkDay?>(null) }

    if (workDayToDelete != null) {
        AlertDialog(
            onDismissRequest = { workDayToDelete = null },
            title = { Text("Excluir Registro") },
            text = { Text("Tem certeza que deseja apagar este registro de ponto?") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteWorkDay(workDayToDelete!!)
                    workDayToDelete = null
                }) { Text("Excluir", color = Color.Red) }
            },
            dismissButton = {
                TextButton(onClick = { workDayToDelete = null }) { Text("Cancelar") }
            }
        )
    }

    if (workDayToEdit != null) {
        EditTimeDialog(
            workDay = workDayToEdit!!,
            onDismiss = { workDayToEdit = null },
            onConfirm = { entrance, exit ->
                viewModel.updateWorkDayTimes(workDayToEdit!!, entrance, exit)
                workDayToEdit = null
            },
            viewModel = viewModel
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Top Row: Title + Export
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = "Histórico", style = MaterialTheme.typography.headlineMedium)
            Button(onClick = {
                val csvData = viewModel.generateCsvExport(workDays)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/csv"
                    putExtra(Intent.EXTRA_SUBJECT, "Relatório de Ponto")
                    putExtra(Intent.EXTRA_TEXT, csvData)
                }
                context.startActivity(Intent.createChooser(intent, "Exportar Histórico"))
            }) {
                Text("Exportar")
            }
        }

        // Top Card: Banco de Horas
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (totalBalance >= 0) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
            ),
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = "Banco de Horas", fontSize = 16.sp)
                Text(
                    text = String.format(Locale.getDefault(), "%.2fh", totalBalance),
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (totalBalance >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                )
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(workDays) { day ->
                WorkDayItem(
                    day = day,
                    viewModel = viewModel,
                    onEdit = { workDayToEdit = day },
                    onDelete = { workDayToDelete = day }
                )
            }
        }
    }
}

@Composable
fun WorkDayItem(
    day: WorkDay,
    viewModel: MainViewModel,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val workedMillis = if (day.exitTime != null) day.exitTime - day.entranceTime else 0L
    val workedHours = workedMillis.toDouble() / (1000 * 60 * 60)
    val balance = workedHours - day.expectedHours

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = day.date, fontWeight = FontWeight.Bold)
                val exitText = if (day.exitTime != null) viewModel.formatTime(day.exitTime) else "--:--"
                Text(
                    text = "${viewModel.formatTime(day.entranceTime)} - $exitText",
                    fontSize = 14.sp
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = viewModel.formatDuration(day.entranceTime, day.exitTime),
                    fontWeight = FontWeight.Medium
                )
                if (day.exitTime != null) {
                    Text(
                        text = String.format(Locale.getDefault(), "%+.2fh", balance),
                        fontSize = 12.sp,
                        color = if (balance >= 0) Color(0xFF4CAF50) else Color.Red
                    )
                }
                Row {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Default.Edit, contentDescription = "Editar", tint = MaterialTheme.colorScheme.primary)
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = "Excluir", tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
fun EditTimeDialog(
    workDay: WorkDay,
    onDismiss: () -> Unit,
    onConfirm: (Long, Long?) -> Unit,
    viewModel: MainViewModel
) {
    var entranceTime by remember { mutableStateOf(workDay.entranceTime) }
    var exitTime by remember { mutableStateOf(workDay.exitTime) }
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar Horários") },
        text = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Entrada: ${viewModel.formatTime(entranceTime)}")
                    Button(onClick = {
                        val cal = Calendar.getInstance().apply { timeInMillis = entranceTime }
                        TimePickerDialog(context, { _, hour, minute ->
                            val newCal = Calendar.getInstance().apply {
                                timeInMillis = entranceTime
                                set(Calendar.HOUR_OF_DAY, hour)
                                set(Calendar.MINUTE, minute)
                            }
                            entranceTime = newCal.timeInMillis
                        }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
                    }) { Text("Alterar") }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val exitText = exitTime?.let { viewModel.formatTime(it) } ?: "--:--"
                    Text("Saída: $exitText")
                    Button(onClick = {
                        val cal = Calendar.getInstance().apply {
                            timeInMillis = exitTime ?: entranceTime
                        }
                        TimePickerDialog(context, { _, hour, minute ->
                            val newCal = Calendar.getInstance().apply {
                                timeInMillis = exitTime ?: entranceTime
                                set(Calendar.HOUR_OF_DAY, hour)
                                set(Calendar.MINUTE, minute)
                            }
                            exitTime = newCal.timeInMillis
                        }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
                    }) { Text("Alterar") }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(entranceTime, exitTime) }) { Text("Salvar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        }
    )
}
