import pandas as pd
import os

file_path = r"c:/ProyectosPython/PLATAFORMA EDUCATIVA/ALUMNOS_HABILIDADES/Formación Profesional en Habilidades Digitales e Inteligencia Artificial (respuestas) (1).xlsx"
if os.path.exists(file_path):
    df = pd.read_excel(file_path)
    print("Columnas encontradas:")
    for col in df.columns:
        print(f"- {col}")
else:
    print("Archivo no encontrado")
