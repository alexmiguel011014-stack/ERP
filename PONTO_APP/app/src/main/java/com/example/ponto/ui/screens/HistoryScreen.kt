package com.example.ponto.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ponto.model.WorkDay
import com.example.ponto.viewmodel.MainViewModel
import java.util.Locale

@Composable
fun HistoryScreen(viewModel: MainViewModel) {
    val workDays by viewModel.allWorkDays.collectAsState()
    val totalBalance = viewModel.calculateBalance(workDays)

    Column(modifier = Modifier.fillMaxSize()) {
        // Top Card: Banco de Horas
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (totalBalance >= 0) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer
            )
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

        Text(
            text = "Histórico de Registros",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(workDays) { day ->
                WorkDayItem(day, viewModel)
            }
        }
    }
}

@Composable
fun WorkDayItem(day: WorkDay, viewModel: MainViewModel) {
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
            Column {
                Text(text = day.date, fontWeight = FontWeight.Bold)
                Text(
                    text = "${viewModel.formatTime(day.entranceTime)} - ${day.exitTime?.let { viewModel.formatTime(it) } ?: \"--:--\"}",
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
            }
        }
    }
}
