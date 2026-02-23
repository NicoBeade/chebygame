import tkinter as tk
from tkinter import ttk, messagebox
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from scipy import signal

class Neandertool:
    def __init__(self, root):
        self.root = root
        self.root.title("Neandertool - Analog Filter Design")
        self.root.geometry("1300x850")
        self.root.configure(bg="#f0f2f5")

        # Set style for a prettier GUI
        self.style = ttk.Style()
        self.style.theme_use('clam')
        self.style.configure("TFrame", background="#f0f2f5")
        self.style.configure("TLabel", background="#f0f2f5", font=('Segoe UI', 11))
        self.style.configure("Header.TLabel", font=('Segoe UI', 18, 'bold'), foreground="#1a202c")
        self.style.configure("Spec.TLabel", font=('Segoe UI', 11, 'bold'), foreground="#4a5568")
        self.style.configure("Action.TButton", font=('Segoe UI', 11, 'bold'))

        # Data Structures
        self.stages = []  
        self.stage_counter = 0 # Persistent counter for unique naming
        self.setup_ui()
        self.update_plot()

    def setup_ui(self):
        """Initializes the improved GUI layout."""
        # Top Bar: Specifications / Stencil
        self.top_bar = ttk.Frame(self.root, padding="15", style="TFrame")
        self.top_bar.pack(side=tk.TOP, fill=tk.X)
        
        ttk.Label(self.top_bar, text="Filter Specifications", style="Header.TLabel").pack(side=tk.LEFT, padx=(0, 20))
        
        spec_fields = [
            ("ωp (rad/s)", "wp", 1000.0),
            ("ωa (rad/s)", "wa", 5000.0),
            ("Amax (dB)", "amax", 3.0),
            ("Amin (dB)", "amin", 40.0),
            ("Gmax (dB)", "gmax", 0.0)
        ]
        
        self.spec_vars = {}
        for label, key, default in spec_fields:
            frame = ttk.Frame(self.top_bar)
            frame.pack(side=tk.LEFT, padx=10)
            ttk.Label(frame, text=label, style="Spec.TLabel").pack(side=tk.LEFT)
            var = tk.DoubleVar(value=default)
            self.spec_vars[key] = var
            entry = ttk.Entry(frame, textvariable=var, width=6, font=('Segoe UI', 11))
            entry.pack(side=tk.LEFT, padx=5)
            var.trace_add("write", lambda *args: self.update_plot())

        # Main Content Area
        self.main_container = ttk.Frame(self.root, padding="10")
        self.main_container.pack(fill=tk.BOTH, expand=True)

        # Left Panel: Stage Management
        self.left_panel = ttk.Frame(self.main_container, width=400)
        self.left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))
        self.left_panel.pack_propagate(False)

        # Header for Stages with Add Button
        self.stage_header = ttk.Frame(self.left_panel)
        self.stage_header.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(self.stage_header, text="Filter Stages", font=('Segoe UI', 14, 'bold')).pack(side=tk.LEFT)
        
        ttk.Button(
            self.stage_header, 
            text="+ Add Stage", 
            command=self.add_stage,
            style="Action.TButton",
            width=12
        ).pack(side=tk.RIGHT)
        
        # Scrollable area for stages
        self.stage_outer = tk.Frame(self.left_panel, bg="#f0f2f5")
        self.stage_outer.pack(fill=tk.BOTH, expand=True)

        # Canvas and scrollable frame
        self.canvas_stages = tk.Canvas(self.stage_outer, bg="#f0f2f5", highlightthickness=0)
        self.scrollable_frame = tk.Frame(self.canvas_stages, bg="#f0f2f5")

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.update_scroll_region()
        )

        self.canvas_window = self.canvas_stages.create_window((0, 0), window=self.scrollable_frame, anchor="nw", width=380)
        self.canvas_stages.pack(side="left", fill="both", expand=True)

        # Hidden scrollbar logic
        self.scrollbar = ttk.Scrollbar(self.stage_outer, orient="vertical", command=self.canvas_stages.yview)
        self.canvas_stages.configure(yscrollcommand=self.scrollbar.set)

        # Bind Mousewheel
        self.root.bind_all("<MouseWheel>", self._on_mousewheel)

        # Scroll Indicators
        self.top_indicator = tk.Frame(self.stage_outer, bg="#f0f2f5", height=2)
        self.top_indicator.place(relx=0, rely=0, relwidth=1)
        
        self.bottom_indicator = tk.Frame(self.stage_outer, bg="#cbd5e0", height=2)
        self.bottom_indicator.place(relx=0, rely=1, relwidth=1, anchor="sw")

        # Right Panel: Plotting Area
        self.right_panel = tk.Frame(self.main_container, bg="#ffffff", bd=1, relief="flat")
        self.right_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.fig, self.ax = plt.subplots(figsize=(8, 6), dpi=100)
        self.fig.patch.set_facecolor('#ffffff')
        self.canvas_plot = FigureCanvasTkAgg(self.fig, master=self.right_panel)
        self.canvas_plot.get_tk_widget().pack(fill=tk.BOTH, expand=True)
        
        self.toolbar = NavigationToolbar2Tk(self.canvas_plot, self.right_panel)
        self.toolbar.configure(background="#ffffff")
        self.toolbar.update()

    def _on_mousewheel(self, event):
        """Handles scrolling from anywhere in the app."""
        self.canvas_stages.yview_scroll(int(-1*(event.delta/120)), "units")
        self.update_indicators()

    def update_scroll_region(self):
        """Updates the internal canvas scroll area and visual indicators."""
        self.canvas_stages.configure(scrollregion=self.canvas_stages.bbox("all"))
        self.update_indicators()

    def update_indicators(self):
        """Updates the appearance of top/bottom bars to indicate more content."""
        y_view = self.canvas_stages.yview()
        if y_view[0] > 0:
            self.top_indicator.configure(bg="#cbd5e0")
        else:
            self.top_indicator.configure(bg="#f0f2f5")
            
        if y_view[1] < 1.0:
            self.bottom_indicator.configure(bg="#cbd5e0")
        else:
            self.bottom_indicator.configure(bg="#f0f2f5")

    def add_stage(self):
        """Adds a new stage with default values immediately."""
        self.stage_counter += 1
        stage_vars = {
            'name': tk.StringVar(value=f"Stage #{self.stage_counter}"),
            'w0': tk.DoubleVar(value=1000.0),
            'Q': tk.DoubleVar(value=0.707),
            'active': tk.BooleanVar(value=True)
        }
        
        # Create UI Card for the stage using tk.Frame for better layout control
        card = tk.Frame(self.scrollable_frame, bg="#ffffff", padx=12, pady=12)
        card.pack(fill=tk.X, pady=6, padx=5)
        
        header_frame = tk.Frame(card, bg="#ffffff")
        header_frame.pack(fill=tk.X)

        e_name = tk.Entry(
            header_frame, 
            textvariable=stage_vars['name'], 
            font=('Segoe UI', 11, 'bold'), 
            width=15,
            bd=0,
            bg="#ffffff",
            highlightthickness=0,
            relief="flat"
        )
        e_name.pack(side=tk.LEFT)
        
        def remove():
            card.destroy()
            self.stages.remove(stage_vars)
            self.update_plot()
            self.root.update_idletasks()
            self.update_scroll_region()

        ttk.Button(header_frame, text="✕", width=3, command=remove).pack(side=tk.RIGHT)
        
        input_frame = tk.Frame(card, bg="#ffffff")
        input_frame.pack(fill=tk.X, pady=8)

        tk.Label(input_frame, text="ω0:", font=('Segoe UI', 11), bg="#ffffff").grid(row=0, column=0, padx=2)
        e_w0 = ttk.Entry(input_frame, textvariable=stage_vars['w0'], width=10, font=('Segoe UI', 11))
        e_w0.grid(row=0, column=1, padx=5)
        
        tk.Label(input_frame, text="Q:", font=('Segoe UI', 11), bg="#ffffff").grid(row=0, column=2, padx=2)
        e_q = ttk.Entry(input_frame, textvariable=stage_vars['Q'], width=8, font=('Segoe UI', 11))
        e_q.grid(row=0, column=3, padx=5)

        cb = ttk.Checkbutton(card, text="Enabled", variable=stage_vars['active'], command=self.update_plot)
        cb.pack(anchor="w")

        # Trace changes to auto-update plot
        stage_vars['w0'].trace_add("write", lambda *args: self.update_plot())
        stage_vars['Q'].trace_add("write", lambda *args: self.update_plot())

        self.stages.append(stage_vars)
        self.update_plot()
        
        self.root.update_idletasks()
        self.canvas_stages.yview_moveto(1.0)
        self.update_indicators()

    def update_plot(self):
        """Calculates total transfer function, validates specs, and updates the plot."""
        try:
            self.ax.clear()
            
            # Get specs
            wp = self.spec_vars['wp'].get()
            wa = self.spec_vars['wa'].get()
            amax = self.spec_vars['amax'].get()
            amin = self.spec_vars['amin'].get()
            gmax_spec = self.spec_vars['gmax'].get()

            # Range calculation
            w_min = min(wp, wa) / 10
            w_max = max(wp, wa) * 10
            if w_min <= 0: w_min = 1
            w = np.logspace(np.log10(w_min), np.log10(w_max), 1200)

            # Draw Stencils
            # Passband Mask
            self.ax.fill_between([w_min, wp], [gmax_spec - amax, gmax_spec - amax], [gmax_spec, gmax_spec], color='#c6f6d5', alpha=0.3)
            self.ax.hlines(gmax_spec - amax, w_min, wp, colors='#38a169', linestyles='--')
            self.ax.hlines(gmax_spec, w_min, wp, colors='#38a169', linestyles='--')
            
            # Stopband Mask
            self.ax.fill_between([wa, w_max], [gmax_spec - amin, gmax_spec - amin], [gmax_spec + 10, gmax_spec + 10], color='#fed7d7', alpha=0.3)
            self.ax.hlines(gmax_spec - amin, wa, w_max, colors='#e53e3e', linestyles='--')
            self.ax.vlines(wa, gmax_spec - amin, gmax_spec + 10, colors='#e53e3e', linestyles='--')

            # Calculate System
            num_total = [1]
            den_total = [1]
            active_stages = [s for s in self.stages if s['active'].get()]
            
            specs_met = True
            if not active_stages:
                mag = np.full_like(w, -100) 
            else:
                for s_vars in active_stages:
                    try:
                        w0 = s_vars['w0'].get()
                        Q = s_vars['Q'].get()
                        if Q <= 0 or w0 <= 0: continue
                        num = [w0**2]
                        den = [1, w0/Q, w0**2]
                        num_total = np.polymul(num_total, num)
                        den_total = np.polymul(den_total, den)
                    except:
                        continue

                sys = signal.TransferFunction(num_total, den_total)
                _, mag, _ = signal.bode(sys, w)

                # Validate Specs
                if np.any(mag > gmax_spec + 0.01): specs_met = False
                mask_pb = w <= wp
                if np.any(mag[mask_pb] < (gmax_spec - amax - 0.01)): specs_met = False
                mask_sb = w >= wa
                if np.any(mag[mask_sb] > (gmax_spec - amin + 0.01)): specs_met = False

            # Plot Results
            line_color = '#2b6cb0' if specs_met else '#e53e3e'
            line_width = 2.0 if specs_met else 3.5
            
            self.ax.semilogx(w, mag, color=line_color, linewidth=line_width, label="Filter Response")
            
            status_text = " (Specs Met)" if specs_met else " (Specs NOT Met)"
            self.ax.set_title("Frequency Response Analysis" + status_text, fontsize=16, pad=15, color=line_color)
            
            self.ax.set_xlabel("Frequency [rad/s]", fontsize=12)
            self.ax.set_ylabel("Magnitude [dB]", fontsize=12)
            self.ax.grid(True, which="both", ls="-", alpha=0.2)
            self.ax.set_ylim(max(gmax_spec - amin - 30, -100), max(gmax_spec + 10, 10))
            self.ax.legend(frameon=True, facecolor='white', loc='upper right')

            self.fig.tight_layout()
            self.canvas_plot.draw()

        except Exception as e:
            pass

if __name__ == "__main__":
    root = tk.Tk()
    app = Neandertool(root)
    root.mainloop()