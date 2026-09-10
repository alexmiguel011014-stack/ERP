import React, { FC, useRef } from "react";
import { CalenderIcon } from "@/icons";

// autoComplete default é "off": nenhum desses inputs tem `name`, mas o
// Chromium ainda tenta sugerir valores de outros formulários da própria app
// (ex: digitar em "Nome" de Fornecedores e o mesmo texto aparecer sozinho em
// "Nome" de Clientes) — bug real reportado pelo dono. Passe autoComplete
// explícito só pra campo que realmente quer sugestão nativa (login, etc.).
interface InputProps {
	type?: "text" | "number" | "email" | "password" | "date" | "time" | string;
	id?: string;
	name?: string;
	placeholder?: string;
	defaultValue?: string | number;
	value?: string | number;
	onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	className?: string;
	min?: string;
	max?: string;
	step?: number;
	disabled?: boolean;
	success?: boolean;
	error?: boolean;
	hint?: string; // Optional hint text
	autoComplete?: string;
}

const Input: FC<InputProps> = ({
	type = "text",
	id,
	name,
	placeholder,
	defaultValue,
	value,
	onChange,
	onKeyDown,
	className = "",
	min,
	max,
	step,
	disabled = false,
	success = false,
	error = false,
	hint,
	autoComplete = "off",
}) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const isDate = type === "date";

	// Determine input styles based on state (disabled, success, error)
	let inputClasses = `h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 ${isDate ? "pr-10" : ""} ${className}`;

	// Add styles for the different states
	if (disabled) {
		inputClasses += ` text-gray-500 border-gray-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700`;
	} else if (error) {
		inputClasses += ` text-error-800 border-error-500 focus:ring-3 focus:ring-error-500/10  dark:text-error-400 dark:border-error-500`;
	} else if (success) {
		inputClasses += ` text-success-500 border-success-400 focus:ring-success-500/10 focus:border-success-300  dark:text-success-400 dark:border-success-500`;
	} else {
		inputClasses += ` bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800`;
	}

	return (
		<div className="relative">
			<input
				ref={inputRef}
				type={type}
				id={id}
				name={name}
				placeholder={placeholder}
				defaultValue={defaultValue}
				value={value}
				onChange={onChange}
				onKeyDown={onKeyDown}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				autoComplete={autoComplete}
				className={inputClasses}
			/>

			{/* Ícone de calendário clicável para abrir o seletor nativo de data */}
			{isDate && !disabled && (
				<button
					type="button"
					tabIndex={-1}
					aria-label="Abrir calendário"
					onClick={() => {
						const el = inputRef.current;
						if (!el) return;
						try {
							el.showPicker();
						} catch {
							el.focus();
						}
					}}
					className="absolute -translate-y-1/2 right-3 top-1/2 text-gray-500 dark:text-gray-400"
				>
					<CalenderIcon className="size-5" />
				</button>
			)}

			{/* Optional Hint Text */}
			{hint && (
				<p
					className={`mt-1.5 text-xs ${
						error
							? "text-error-500"
							: success
								? "text-success-500"
								: "text-gray-500"
					}`}
				>
					{hint}
				</p>
			)}
		</div>
	);
};

export default Input;
