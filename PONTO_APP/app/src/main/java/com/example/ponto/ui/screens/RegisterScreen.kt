package com.example.ponto.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ponto.viewmodel.MainViewModel

@Composable
fun RegisterScreen(viewModel: MainViewModel) {
    val activeDay by viewModel.activeWorkDay.collectAsState()
    val expectedHours by viewModel.expectedHours.collectAsState()
    var hoursInput by remember(expectedHours) { mutableStateOf(expectedHours.toString()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Configuração", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(8.dp))
        
        OutlinedTextField(
            value = hoursInput,
            onValueChange = { 
                hoursInput = it
                it.toIntOrNull()?.let { hours -> viewModel.saveExpectedHours(hours) }
            },
            label = { Text("Carga Horária Diária (h)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.width(200.dp)
        )

        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = if (activeDay != null) "Trabalhando" else "Fora do expediente",
            fontSize = 20.sp,
            color = if (activeDay != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary
        )

        if (activeDay != null) {
            Text(
                text = "Entrada: ${viewModel.formatTime(activeDay!!.entranceTime)}",
                style = MaterialTheme.typography.bodyLarge
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (activeDay == null) {
            Button(
                onClick = { viewModel.punchIn() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp)
            ) {
                Text("Bater Ponto de Entrada", fontSize = 18.sp)
            }
        } else {
            Button(
                onClick = { viewModel.punchOut() },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp)
            ) {
                Text("Bater Ponto de Saída", fontSize = 18.sp)
            }
        }
    }
}
