package com.example.ponto.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object Register : Screen("register", "Registro", Icons.Default.Schedule)
    object History : Screen("history", "Histórico", Icons.Default.History)
}

val items = listOf(
    Screen.Register,
    Screen.History
)
