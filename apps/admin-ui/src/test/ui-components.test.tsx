import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../components/ui/button.tsx";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui/card.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Input } from "../components/ui/input.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { Select } from "../components/ui/select.tsx";
import { FormField } from "../components/ui/form-field.tsx";
import { Modal } from "../components/ui/modal.tsx";
import { EmptyState } from "../components/ui/empty-state.tsx";
import { LoadingState } from "../components/ui/loading-state.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { MetricCard } from "../components/ui/metric-card.tsx";
import { TabGroup } from "../components/ui/tab-group.tsx";

describe("Button", () => {
  it("renders with text content", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies variant classes", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-destructive");
  });

  it("applies size classes", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button", { name: "Small" });
    expect(btn.className).toContain("h-9");
  });

  it("forwards onClick handler", () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Press</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("merges custom className", () => {
    render(<Button className="mt-4">Styled</Button>);
    const btn = screen.getByRole("button", { name: "Styled" });
    expect(btn.className).toContain("mt-4");
  });
});

describe("Card", () => {
  it("renders card with header, title, content, and footer", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders with variant", () => {
    render(<Badge variant="success">Active</Badge>);
    const badge = screen.getByText("Active");
    expect(badge.className).toContain("bg-status-success-bg");
  });

  it("defaults to neutral variant", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-mist");
  });
});

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("forwards type prop", () => {
    render(<Input type="email" placeholder="Email" />);
    expect(screen.getByPlaceholderText("Email")).toHaveAttribute("type", "email");
  });
});

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea placeholder="Write here" />);
    expect(screen.getByPlaceholderText("Write here")).toBeInTheDocument();
  });
});

describe("Select", () => {
  it("renders a select element with options", () => {
    render(
      <Select defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toHaveValue("b");
  });
});

describe("FormField", () => {
  it("renders label and children", () => {
    render(
      <FormField label="Name">
        <Input placeholder="Your name" />
      </FormField>,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
  });

  it("shows error message when provided", () => {
    render(
      <FormField label="Email" error="Required field">
        <Input />
      </FormField>,
    );
    expect(screen.getByText("Required field")).toBeInTheDocument();
  });

  it("does not render error paragraph when no error", () => {
    const { container } = render(
      <FormField label="Name">
        <Input />
      </FormField>,
    );
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("Modal", () => {
  it("renders when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>Hidden content</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Closeable">
        <p>Press escape</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Backdrop">
        <p>Click outside</p>
      </Modal>,
    );
    // The backdrop is the element with aria-hidden="true"
    const backdrop = document.querySelector("[aria-hidden='true']")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("EmptyState", () => {
  it("renders the message", () => {
    render(<EmptyState message="No items found" />);
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("renders default message", () => {
    render(<LoadingState />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders custom message", () => {
    render(<LoadingState message="Fetching data..." />);
    expect(screen.getByText("Fetching data...")).toBeInTheDocument();
  });
});

describe("Alert", () => {
  it("renders with error variant", () => {
    render(<Alert variant="error">Something went wrong</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert.className).toContain("bg-status-error-bg");
  });

  it("renders with success variant", () => {
    render(<Alert variant="success">Saved</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("bg-status-success-bg");
  });
});

describe("MetricCard", () => {
  it("renders label and value", () => {
    render(<MetricCard label="Total cookies" value={142} />);
    expect(screen.getByText("Total cookies")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
  });

  it("renders comparison when provided", () => {
    render(
      <MetricCard
        label="Consent rate"
        value="87.2%"
        comparison={{ previous: "82.1%", direction: "up" }}
      />,
    );
    expect(screen.getByText("87.2%")).toBeInTheDocument();
    expect(screen.getByText(/82\.1%/)).toBeInTheDocument();
  });

  it("shows up arrow for positive direction", () => {
    render(
      <MetricCard
        label="Rate"
        value="50%"
        comparison={{ previous: "40%", direction: "up" }}
      />,
    );
    expect(screen.getByText("↑")).toBeInTheDocument();
  });

  it("shows down arrow for negative direction", () => {
    render(
      <MetricCard
        label="Rate"
        value="30%"
        comparison={{ previous: "40%", direction: "down" }}
      />,
    );
    expect(screen.getByText("↓")).toBeInTheDocument();
  });
});

describe("TabGroup", () => {
  const options = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];

  it("renders all options", () => {
    render(<TabGroup options={options} value="day" onChange={() => {}} />);
    expect(screen.getByText("Day")).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
    expect(screen.getByText("Month")).toBeInTheDocument();
  });

  it("calls onChange with correct value on click", () => {
    const onChange = vi.fn();
    render(<TabGroup options={options} value="day" onChange={onChange} />);
    fireEvent.click(screen.getByText("Week"));
    expect(onChange).toHaveBeenCalledWith("week");
  });

  it("highlights the active option", () => {
    render(<TabGroup options={options} value="week" onChange={() => {}} />);
    const activeBtn = screen.getByText("Week");
    expect(activeBtn.className).toContain("bg-card");
  });
});
