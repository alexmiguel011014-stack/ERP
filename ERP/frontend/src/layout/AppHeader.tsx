"use client";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import UserDropdown from "@/components/header/UserDropdown";
import IconeModulo from "@/components/common/IconeModulo";
import { useTabs } from "@/context/TabsContext";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

const AppHeader: React.FC = () => {
	const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
	const { abas, abaAtivaId, fecharAba } = useTabs();
	const router = useRouter();

	const toggleApplicationMenu = () => {
		setApplicationMenuOpen(!isApplicationMenuOpen);
	};

	return (
		<header className="sticky top-0 flex w-full bg-[#0F172A] border-white/10 z-99999 lg:border-b">
			<div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-4">
				<div className="flex items-center justify-between w-full gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:hidden">
					<Link href="/" className="lg:hidden">
						<Image
							width={154}
							height={32}
							className="dark:hidden"
							src="./images/logo/logo.svg"
							alt="Logo"
						/>
						<Image
							width={154}
							height={32}
							className="hidden dark:block"
							src="./images/logo/logo-dark.svg"
							alt="Logo"
						/>
					</Link>

					<button
						onClick={toggleApplicationMenu}
						className="flex items-center justify-center w-10 h-10 text-gray-700 rounded-lg z-99999 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								fillRule="evenodd"
								clipRule="evenodd"
								d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
								fill="currentColor"
							/>
						</svg>
					</button>
				</div>
				{abas.length > 0 && (
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
						{abas.map((aba) => {
							const ativa = aba.id === abaAtivaId;
							const fechavel = aba.id !== "dashboard";
							return (
								<div
									key={aba.id}
									className={`group flex shrink-0 items-center gap-1.5 rounded-lg py-1 pl-2 text-sm transition-colors ${
										fechavel ? "pr-1" : "pr-2"
									} ${
										ativa
											? "bg-blue-500 text-white"
											: "bg-white/5 text-gray-300 hover:bg-white/10"
									}`}
								>
									<button
										type="button"
										onClick={() => router.push(aba.href)}
										className="flex items-center gap-1.5"
										title={aba.titulo}
									>
										<span className="[&>svg]:size-4">
											<IconeModulo svg={aba.icone} />
										</span>
										<span className="max-w-[120px] truncate font-medium">
											{aba.titulo}
										</span>
									</button>
									{fechavel && (
										<button
											type="button"
											onClick={() => fecharAba(aba.id)}
											title={`Fechar ${aba.titulo}`}
											className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
												ativa
													? "hover:bg-white/20"
													: "hover:bg-white/10 group-hover:text-white"
											}`}
										>
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												xmlns="http://www.w3.org/2000/svg"
											>
												<path
													d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
													fill="currentColor"
												/>
											</svg>
										</button>
									)}
								</div>
							);
						})}
					</div>
				)}
				<div
					className={`${
						isApplicationMenuOpen ? "flex" : "hidden"
					} items-center justify-between w-full gap-4 px-5 py-2 lg:flex lg:w-auto lg:shrink-0 lg:py-1 shadow-theme-md lg:justify-end lg:px-0 lg:shadow-none`}
				>
					<div className="flex items-center gap-2 2xsm:gap-3">
						<ThemeToggleButton />
					</div>
					<UserDropdown />
				</div>
			</div>
		</header>
	);
};

export default AppHeader;
